const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('afk');

// Shape: { [guildId]: { [userId]: { reason, at } } }
const MAX_REASON = 200;

function setAfk(guildId, userId, reason = '') {
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) db[guildId] = {};
  db[guildId][userId] = { reason: String(reason || '').trim().slice(0, MAX_REASON), at: Date.now() };
  save(FILE, db);
  return db[guildId][userId];
}

function clearAfk(guildId, userId) {
  try {
    const db = load(FILE);
    if (!db[guildId] || db[guildId][userId] === undefined) return false;
    delete db[guildId][userId];
    save(FILE, db);
    return true;
  } catch {
    return false;
  }
}

function getAfk(guildId, userId) {
  try {
    const e = load(FILE)[guildId]?.[userId];
    return e && typeof e === 'object' ? e : null;
  } catch {
    return null;
  }
}

module.exports = { setAfk, clearAfk, getAfk, MAX_REASON };
