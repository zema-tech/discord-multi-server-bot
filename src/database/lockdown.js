const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('lockdown');

/**
 * Snapshot lockdown per guild:
 * { [guildId]: { motivo, by, byTag, at, channels: { [channelId]: 'allow'|'deny'|'neutral' } } }
 */

function getLockdown(guildId) {
  if (!guildId) return null;
  const db = load(FILE);
  const entry = db[guildId];
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
}

function setLockdown(guildId, data) {
  // Solo oggetti: niente stringhe/numeri persistiti che romperebbero i reader.
  if (!guildId) throw new Error('guildId mancante.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Dati lockdown non validi (atteso oggetto).');
  }
  const clean = { ...data };
  if (clean.channels !== undefined && (typeof clean.channels !== 'object' || clean.channels === null)) {
    clean.channels = {};
  }
  const db = load(FILE);
  db[guildId] = clean;
  save(FILE, db);
  return clean;
}

function clearLockdown(guildId) {
  const db = load(FILE);
  delete db[guildId];
  save(FILE, db);
}

module.exports = { getLockdown, setLockdown, clearLockdown };
