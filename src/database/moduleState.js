'use strict';
/**
 * src/database/moduleState.js — Interruttori on/off per feature del bot.
 *
 * Ogni feature (vedi src/modules/registry.js) è attiva di default; qui si
 * persistono SOLO le eccezioni ({ [featureId]: false }). Lettura mai
 * bloccante, scrittura validata contro il registry (id noti, non locked).
 *
 * Storage: stesso backend degli altri moduli (jsonDb load/save/dbFile).
 */

const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('moduleState');

function readAll() {
  try {
    const db = load(FILE);
    return db && typeof db === 'object' && !Array.isArray(db) ? db : {};
  } catch {
    return {};
  }
}

function knownIds() {
  try {
    const registry = require('../modules/registry');
    if (registry && typeof registry.ids === 'function') return registry.ids();
  } catch { /* registry non caricato: nessuna validazione */ }
  return null;
}

/** Mappa guildId -> array di feature disabilitate (solo record esistenti). */
function getDisabled(guildId) {
  if (!guildId) return [];
  const db = readAll();
  const rec = db[guildId];
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return [];
  const known = knownIds();
  return Object.keys(rec).filter((id) => {
    if (rec[id] !== false) return false;
    if (known && !known.includes(id)) return false;
    return true;
  });
}

function isEnabled(guildId, featureId) {
  if (!guildId || !featureId) return true;
  // 'system' non è mai disabilitabile (difesa in profondità, anche senza registry).
  if (featureId === 'system') return true;
  try {
    const registry = require('../modules/registry');
    if (registry && typeof registry.isLocked === 'function' && registry.isLocked(featureId)) return true;
  } catch { /* senza registry: default on */ }
  return !getDisabled(guildId).includes(featureId);
}

/**
 * Imposta on/off. Ritorna { featureId, enabled }.
 * Lancia su feature sconosciuta o locked (il chiamante mappa in 400).
 */
function setEnabled(guildId, featureId, enabled) {
  if (!guildId) throw new Error('guildId mancante.');
  if (!featureId || typeof featureId !== 'string') throw new Error('featureId non valido.');
  const known = knownIds();
  if (known && !known.includes(featureId)) throw new Error(`Feature sconosciuta: ${featureId}.`);
  if (featureId === 'system') throw new Error('Il modulo di sistema non si può disattivare.');
  try {
    const registry = require('../modules/registry');
    if (registry && typeof registry.isLocked === 'function' && registry.isLocked(featureId)) {
      throw new Error('Questo modulo è sempre attivo.');
    }
  } catch (e) {
    if (e && /sempre attivo|disattivare/.test(e.message)) throw e;
  }
  const db = readAll();
  if (enabled) {
    if (db[guildId] && typeof db[guildId] === 'object') {
      delete db[guildId][featureId];
      if (Object.keys(db[guildId]).length === 0) delete db[guildId];
    }
  } else {
    if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) db[guildId] = {};
    db[guildId][featureId] = false;
  }
  save(FILE, db);
  return { featureId, enabled: Boolean(enabled) };
}

module.exports = { getDisabled, isEnabled, setEnabled };
