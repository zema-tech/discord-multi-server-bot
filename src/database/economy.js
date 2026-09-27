const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('economy');
const TUNING_FILE = dbFile('economyTuning');

const DEFAULTS = { balance: 0, bank: 0, lastDaily: 0, lastWork: 0, lastSlots: 0, lastRob: 0 };

// Tuning server (letto dai comandi daily/work/slots, modificabile da dashboard):
// dailyAmount = ricompensa base /daily, workPct = % guadagni /work, slotsMax = puntata max.
const DEFAULT_TUNING = { dailyAmount: 500, workPct: 100, slotsMax: 10000 };

function clampInt(v, min, max, fb) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fb;
}

/** Config tuning del server (merge + sanitize, mai lancia). */
function getTuning(guildId) {
  try {
    const db = load(TUNING_FILE);
    const raw = (guildId && db[guildId] && typeof db[guildId] === 'object') ? db[guildId] : {};
    return {
      dailyAmount: clampInt(raw.dailyAmount, 100, 5000, DEFAULT_TUNING.dailyAmount),
      workPct: clampInt(raw.workPct, 10, 500, DEFAULT_TUNING.workPct),
      slotsMax: clampInt(raw.slotsMax, 100, 100000, DEFAULT_TUNING.slotsMax),
    };
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

/** Aggiorna il tuning (patch parziale, chiavi note). Lancia su guild mancante. */
function setTuning(guildId, patch = {}) {
  if (!guildId) throw new Error('guildId mancante.');
  const safe = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const next = { ...getTuning(guildId) };
  if (safe.dailyAmount !== undefined) next.dailyAmount = clampInt(safe.dailyAmount, 100, 5000, next.dailyAmount);
  if (safe.workPct !== undefined) next.workPct = clampInt(safe.workPct, 10, 500, next.workPct);
  if (safe.slotsMax !== undefined) next.slotsMax = clampInt(safe.slotsMax, 100, 100000, next.slotsMax);
  const db = load(TUNING_FILE);
  db[guildId] = next;
  save(TUNING_FILE, db);
  return { ...next };
}

// Numero finito >= 0, altrimenti fallback. Evita NaN/stringhe/infiniti nei saldi.
function num(v, fallback = 0) {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function sanitize(entry = {}) {
  return {
    ...entry,
    balance: num(entry.balance),
    bank: num(entry.bank),
    lastDaily: num(entry.lastDaily),
    lastWork: num(entry.lastWork),
    lastSlots: num(entry.lastSlots),
    lastRob: num(entry.lastRob),
    // Streak daily: intero >= 0 (record corrotti mostrerebbero "Infinity giorni").
    dailyStreak: Number.isFinite(entry.dailyStreak) ? Math.min(Math.max(0, Math.floor(entry.dailyStreak)), 10000) : 0,
  };
}

// Lettura pura: NON crea/salva record (evita righe fantasma da balance/leaderboard/pay).
function getUser(guildId, userId) {
  const db = load(FILE);
  const entry = db[guildId]?.[userId];
  if (!entry) return { ...DEFAULTS };
  return sanitize(entry);
}

function updateUser(guildId, userId, data) {
  if (!guildId || !userId) return { ...DEFAULTS };
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  const current = db[guildId][userId] ? sanitize(db[guildId][userId]) : { ...DEFAULTS };
  db[guildId][userId] = sanitize({ ...current, ...data });
  save(FILE, db);
  return db[guildId][userId];
}

function addBalance(guildId, userId, amount) {
  if (!guildId || !userId) return { ...DEFAULTS };
  if (!Number.isFinite(amount)) amount = 0;
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  const current = db[guildId][userId] ? sanitize(db[guildId][userId]) : { ...DEFAULTS };
  // Math.max(0, ...) da solo non basta: con NaN restituirebbe NaN. sanitize() lo impedisce.
  // Clamp anti-overflow: saldi oltre MAX_SAFE_INTEGER diventerebbero Infinity e corromperebbero il JSON.
  let v = current.balance + amount;
  if (!Number.isFinite(v)) v = amount > 0 ? Number.MAX_SAFE_INTEGER : 0;
  current.balance = Math.max(0, Math.min(v, Number.MAX_SAFE_INTEGER));
  db[guildId][userId] = current;
  save(FILE, db);
  return current;
}

function getLeaderboard(guildId, limit = 10) {
  const db = load(FILE);
  if (!db[guildId]) return [];
  return Object.entries(db[guildId])
    .map(([id, data]) => ({ id, balance: num(data.balance) + num(data.bank) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10);
}

module.exports = { getUser, updateUser, addBalance, getLeaderboard, getTuning, setTuning, DEFAULT_TUNING };
