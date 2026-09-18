const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('economy');

const DEFAULTS = { balance: 0, bank: 0, lastDaily: 0, lastWork: 0, lastSlots: 0, lastRob: 0 };

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

module.exports = { getUser, updateUser, addBalance, getLeaderboard };
