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

module.exports = { load, save, dbFile };
