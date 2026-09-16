const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('warnings');

function getWarnings(guildId, userId) {
  const db = load(FILE);
  return ((db[guildId] || {})[userId]) || [];
}

function addWarn(guildId, userId, { modId, reason }) {
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = [];
  const warn = { id: Date.now().toString(36), modId, reason, at: Date.now() };
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
  const db = load(FILE);
  if (!db[guildId]?.[userId]) return false;
  const before = db[guildId][userId].length;
  db[guildId][userId] = db[guildId][userId].filter((w) => w.id !== warnId);
  save(FILE, db);
  return db[guildId][userId].length !== before;
}

module.exports = { getWarnings, addWarn, clearWarnings, removeWarn };
