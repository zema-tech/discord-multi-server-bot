/**
 * aiUsage.js — conteggio giornaliero chiamate AI (controllo costi su chiave condivisa).
 *
 * Shape su jsonDb (file aiUsage.json):
 *   { [YYYY-MM-DD]: { total: number } }
 * Mantiene solo gli ultimi 7 giorni (prune automatico ad ogni countCall).
 *
 * CommonJS, zero dipendenze. MAI lanciare: i consumer (utils/ai.js) avvolgono
 * comunque ogni chiamata in try/catch così un DB corrotto non rompe mai l'AI.
 */
'use strict';

const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('aiUsage');
const RETENTION_DAYS = 7;

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isDayKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

function loadDb() {
  const db = load(FILE);
  return db && typeof db === 'object' && !Array.isArray(db) ? db : {};
}

/** Rimuove i giorni più vecchi di 7 giorni (confronto lessicografico su YYYY-MM-DD). */
function prune(db) {
  const cutoff = todayKey(new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000));
  for (const key of Object.keys(db)) {
    if (!isDayKey(key) || key < cutoff) delete db[key];
  }
  return db;
}

/** Totale chiamate di oggi (0 se assente). Solo lettura, non salva. */
function todayCount() {
  const db = loadDb();
  const entry = db[todayKey()];
  const total = entry && typeof entry.total === 'number' ? entry.total : 0;
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

/** Incrementa il contatore di oggi (+prune) e restituisce il nuovo totale. */
function countCall() {
  const db = loadDb();
  prune(db);
  const key = todayKey();
  const prev = db[key] && typeof db[key].total === 'number' ? db[key].total : 0;
  const next = (Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0) + 1;
  db[key] = { total: next };
  save(FILE, db);
  return next;
}

module.exports = { todayCount, countCall, todayKey, FILE };
