const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('analytics');
const MAX_DAYS = 60;
const FIELDS = ['messages', 'joins', 'leaves'];

/** Chiave giorno locale YYYY-MM-DD (TZ del server, coerente per bump e letture). */
function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptyDay() {
  return { messages: 0, joins: 0, leaves: 0 };
}

function sanitizeDay(entry = {}) {
  const out = emptyDay();
  for (const f of FIELDS) {
    const v = entry[f];
    out[f] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }
  return out;
}

/** Rimuove i giorni oltre MAX_DAYS (i più vecchi, chiavi ISO ordinabili). */
function prune(guildEntry) {
  if (!guildEntry || typeof guildEntry.days !== 'object') return;
  const keys = Object.keys(guildEntry.days).sort();
  while (keys.length > MAX_DAYS) {
    delete guildEntry.days[keys.shift()];
  }
}

/**
 * Incrementa di 1 il contatore `field` per la guild nel giorno corrente.
 * field: 'messages' | 'joins' | 'leaves'. Field non validi: nessun effetto.
 * Solo conteggio, mai contenuto dei messaggi.
 */
function bump(guildId, field) {
  if (!guildId || !FIELDS.includes(field)) return null;
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object') db[guildId] = { days: {} };
  if (!db[guildId].days || typeof db[guildId].days !== 'object') db[guildId].days = {};
  const key = dayKey();
  db[guildId].days[key] = sanitizeDay(db[guildId].days[key]);
  db[guildId].days[key][field] += 1;
  prune(db[guildId]);
  save(FILE, db);
  return { ...db[guildId].days[key] };
}

/** Ultimi n giorni (fino a oggi incluso), con zeri per i giorni mancanti. */
function getDays(guildId, n = 7) {
  const days = Math.max(1, Math.min(30, Math.floor(n) || 7));
  const db = load(FILE);
  const stored = (db[guildId] && db[guildId].days) || {};
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    out.push({ date: key, ...sanitizeDay(stored[key]) });
  }
  return out;
}

/** Totali sommati sugli ultimi n giorni. */
function totals(guildId, n = 7) {
  const rows = getDays(guildId, n);
  const t = emptyDay();
  for (const r of rows) {
    t.messages += r.messages;
    t.joins += r.joins;
    t.leaves += r.leaves;
  }
  return t;
}

module.exports = { bump, getDays, totals, dayKey, MAX_DAYS };
