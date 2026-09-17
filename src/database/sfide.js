const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('sfide');

const TIPO = 'messaggi';
const OBIETTIVO = 50;
const DURATA = 7 * 24 * 3600 * 1000; // 7 giorni
const PREMIO = 500; // 🪙 assegnati al completamento

function num(v, fallback = 0) {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function newSfida(now = Date.now()) {
  return { id: now.toString(36), tipo: TIPO, obiettivo: OBIETTIVO, inizio: now };
}

function sanitize(stored = {}) {
  const current = stored.current && typeof stored.current === 'object' ? stored.current : null;
  const progress = {};
  if (stored.progress && typeof stored.progress === 'object') {
    for (const [k, v] of Object.entries(stored.progress)) {
      if (Number.isFinite(v) && v >= 0) progress[k] = Math.floor(v);
    }
  }
  const completati = Array.isArray(stored.completati) ? stored.completati.filter((x) => typeof x === 'string') : [];
  return { current, progress, completati };
}

// Restituisce la sfida attiva della guild, rigenerandola se scaduta (>7gg) o mancante.
// Il salvataggio avviene solo quando serve (prima creazione o reset).
function getSfida(guildId, now = Date.now()) {
  const db = load(FILE);
  let entry = db[guildId] ? sanitize(db[guildId]) : { current: null, progress: {}, completati: [] };
  if (!entry.current || !Number.isFinite(entry.current.inizio) || now - entry.current.inizio >= DURATA) {
    entry = { current: newSfida(now), progress: {}, completati: [] };
    if (!db[guildId]) db[guildId] = {};
    db[guildId] = entry;
    save(FILE, db);
  }
  return entry;
}

// Forza un reset manuale (nuovo ciclo settimanale).
function resetSfida(guildId, now = Date.now()) {
  const db = load(FILE);
  const entry = { current: newSfida(now), progress: {}, completati: [] };
  if (!db[guildId]) db[guildId] = {};
  db[guildId] = entry;
  save(FILE, db);
  return entry;
}

// Incrementa il progresso di 1. Ritorna { count, completed, already }.
// - completed=true solo al messaggio che raggiunge l'obiettivo (una volta sola).
// - already=true se l'utente aveva già completato (nessun doppio premio).
function addProgress(guildId, userId, now = Date.now()) {
  const sfida = getSfida(guildId, now);
  if (sfida.completati.includes(userId)) {
    return { count: num(sfida.progress[userId]), completed: false, already: true };
  }
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = { current: sfida.current, progress: {}, completati: [] };
  const entry = sanitize(db[guildId]);
  // Se un reset è scattato tra le due letture, riparti dallo stato fresco.
  if (!entry.current || entry.current.id !== sfida.current.id) {
    return addProgress(guildId, userId, now);
  }
  const count = Math.floor(num(entry.progress[userId])) + 1;
  entry.progress[userId] = count;
  let completed = false;
  if (count >= OBIETTIVO) {
    entry.completati.push(userId);
    completed = true;
  }
  db[guildId] = entry;
  save(FILE, db);
  return { count, completed, already: false };
}

function getProgress(guildId, userId, now = Date.now()) {
  const sfida = getSfida(guildId, now);
  return num(sfida.progress[userId]);
}

function isCompletata(guildId, userId, now = Date.now()) {
  return getSfida(guildId, now).completati.includes(userId);
}

function getMiniLeaderboard(guildId, limit = 5, now = Date.now()) {
  const sfida = getSfida(guildId, now);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  return Object.entries(sfida.progress)
    .map(([id, count]) => ({ id, count: Math.floor(num(count)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, safeLimit);
}

module.exports = {
  getSfida,
  resetSfida,
  addProgress,
  getProgress,
  isCompletata,
  getMiniLeaderboard,
  TIPO,
  OBIETTIVO,
  DURATA,
  PREMIO,
};
