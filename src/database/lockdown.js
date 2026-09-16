const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('lockdown');

/**
 * Snapshot lockdown per guild:
 * { [guildId]: { motivo, by, byTag, at, channels: { [channelId]: 'allow'|'deny'|'neutral' } } }
 */

function getLockdown(guildId) {
  const db = load(FILE);
  return db[guildId] || null;
}

function setLockdown(guildId, data) {
  const db = load(FILE);
  db[guildId] = data;
  save(FILE, db);
  return data;
}

function clearLockdown(guildId) {
  const db = load(FILE);
  delete db[guildId];
  save(FILE, db);
}

module.exports = { getLockdown, setLockdown, clearLockdown };
