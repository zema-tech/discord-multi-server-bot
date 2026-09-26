const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('statChannels');

// Shape: { [guildId]: { membersId, onlineId, botsId } }

function get(guildId) {
  try {
    const g = load(FILE)[guildId];
    return g && typeof g === 'object' ? g : {};
  } catch {
    return {};
  }
}

function set(guildId, ids) {
  const db = load(FILE);
  db[guildId] = {
    membersId: ids.membersId || null,
    onlineId: ids.onlineId || null,
    botsId: ids.botsId || null,
  };
  save(FILE, db);
  return db[guildId];
}

function clear(guildId) {
  try {
    const db = load(FILE);
    if (db[guildId] === undefined) return false;
    delete db[guildId];
    save(FILE, db);
    return true;
  } catch {
    return false;
  }
}

module.exports = { get, set, clear };
