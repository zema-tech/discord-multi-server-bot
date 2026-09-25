'use strict';

/**
 * jsonDb.js — compat layer sopra store.js (CommonJS, zero dipendenze).
 *
 * Export e semantica IDENTICI allo storico mini JSON-DB sincrono:
 *   load(file)  -> oggetto dal file ({} se manca/corrotto; i corrotti vengono
 *                  copiati in "<file>.corrupt-<timestamp>" per il recupero).
 *   save(file, data) -> scrittura atomica via tmp+rename.
 *   dbFile(name) -> path.join(__dirname, `<name>.json`).
 *
 * Il backend reale (json su file o sqlite via node:sqlite) è scelto da
 * store.js in base a env DB_BACKEND/DB_SQLITE_PATH: con backend json il
 * comportamento è byte-identico a prima (stessi path, zero migrazione);
 * con backend sqlite load/save mappano il FILE sulla collection omonima
 * (basename senza .json), così i ~25 moduli esistenti funzionano invariati.
 */

const path = require('path');
const store = require('./store');

function load(file) {
  return store.loadFile(file);
}

function save(file, data) {
  store.saveFile(file, data);
}

function dbFile(name) {
  return path.join(__dirname, `${name}.json`);
}

/** Chiavi `__*` sono metadati, mai guild/utenti: gli iteratori devono skipparle. */
function isMetaKey(k) {
  return typeof k === 'string' && k.startsWith('__');
}

/**
 * Migrazioni schema stile Lumi (db:migrate minimale per JSON).
 * Carica, applica i passi mancanti via schema.js in ordine, timbra `__v`
 * e salva SOLO se qualcosa è cambiato. Ritorna il db. Mai lanciare.
 */
function ensureMigrated(file, name) {
  let db = null;
  try {
    db = load(file);
  } catch {
    return db;
  }
  if (!db || typeof db !== 'object' || Array.isArray(db)) return db;
  try {
    const schema = require('./schema');
    if (schema && typeof schema.migrateToCurrent === 'function') {
      const changed = schema.migrateToCurrent(name, db);
      if (changed) {
        try {
          save(file, db);
        } catch {}
      }
    }
  } catch {}
  return db;
}

module.exports = { load, save, dbFile, ensureMigrated, isMetaKey };
