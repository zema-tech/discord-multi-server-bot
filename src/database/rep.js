const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('rep');

const COOLDOWN = 24 * 3600 * 1000; // 24h per giver

function num(v, fallback = 0) {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function sanitize(entry = {}) {
  const lastGiven = {};
  if (entry.lastGiven && typeof entry.lastGiven === 'object') {
    for (const [k, v] of Object.entries(entry.lastGiven)) {
      if (Number.isFinite(v) && v >= 0) lastGiven[k] = v;
    }
  }
  return { ...entry, count: Math.floor(num(entry.count)), lastGiven };
}

// Lettura pura: NON crea record.
function getRep(guildId, userId) {
  const db = load(FILE);
  const entry = db[guildId]?.[userId];
  if (!entry) return { count: 0, lastGiven: {} };
  return sanitize(entry);
}

// Timestamp dell'ultima rep data da giverId a userId (0 se mai).
function getLastGiven(guildId, giverId, receiverId) {
  const rep = getRep(guildId, receiverId);
  const ts = rep.lastGiven[giverId];
  return Number.isFinite(ts) ? ts : 0;
}

function canGive(guildId, giverId, receiverId, now = Date.now()) {
  const last = getLastGiven(guildId, giverId, receiverId);
  return now - last >= COOLDOWN;
}

// Assegna +1 rep. Presuppone i controlli (self/bot/cooldown) fatti dal comando.
function giveRep(guildId, giverId, receiverId, now = Date.now()) {
  if (!guildId || !receiverId) return { count: 0, lastGiven: {} };
  const giver = typeof giverId === 'string' && giverId ? giverId : 'unknown';
  const ts = Number.isFinite(now) ? now : Date.now();
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  const current = db[guildId][receiverId] ? sanitize(db[guildId][receiverId]) : { count: 0, lastGiven: {} };
  current.count = Math.min(current.count + 1, Number.MAX_SAFE_INTEGER);
  current.lastGiven[giver] = ts;
  db[guildId][receiverId] = current;
  save(FILE, db);
  return current;
}

function getLeaderboard(guildId, limit = 10) {
  const db = load(FILE);
  if (!db[guildId]) return [];
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  return Object.entries(db[guildId])
    .map(([id, data]) => ({ id, count: Math.floor(num(sanitize(data).count)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, safeLimit);
}

module.exports = { getRep, getLastGiven, canGive, giveRep, getLeaderboard, COOLDOWN };
