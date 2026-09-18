const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('warnings');

function getWarnings(guildId, userId) {
  if (!guildId || !userId) return [];
  const db = load(FILE);
  const list = ((db[guildId] || {})[userId]) || [];
  // DB corrotto (oggetto/stringa al posto dell'array): fallback [] invece di rompere i caller.
  return Array.isArray(list) ? list : [];
}

function makeId(existing) {
  const seen = new Set(existing.map((w) => w && w.id));
  let id = '';
  do {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (seen.has(id));
  return id;
}

function addWarn(guildId, userId, { modId, reason } = {}) {
  if (!guildId || !userId) throw new Error('guildId/userId mancanti.');
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  if (!Array.isArray(db[guildId][userId])) db[guildId][userId] = [];
  const warn = {
    id: makeId(db[guildId][userId]),
    modId: typeof modId === 'string' && modId ? modId : 'unknown',
    reason: typeof reason === 'string' && reason.trim() ? reason.slice(0, 1000) : 'Nessun motivo specificato',
    at: Date.now(),
  };
  db[guildId][userId].push(warn);
  save(FILE, db);
  return warn;
}

function clearWarnings(guildId, userId) {
  const db = load(FILE);
  if (db[guildId]) {
    delete db[guildId][userId];
    save(FILE, db);
  }
}

function removeWarn(guildId, userId, warnId) {
  if (!guildId || !userId) return false;
  const db = load(FILE);
  if (!Array.isArray(db[guildId]?.[userId])) return false;
  const before = db[guildId][userId].length;
  db[guildId][userId] = db[guildId][userId].filter((w) => w.id !== warnId);
  save(FILE, db);
  return db[guildId][userId].length !== before;
}

module.exports = { getWarnings, addWarn, clearWarnings, removeWarn };
