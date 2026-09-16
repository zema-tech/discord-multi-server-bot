const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('starboard');

const DEFAULTS = {
  channelId: null,
  threshold: 3,
  emoji: '⭐',
};

function getStarboard(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { ...DEFAULTS, posted: {} };
    save(FILE, db);
  }
  const cfg = {
    ...DEFAULTS,
    ...db[guildId],
    posted: db[guildId].posted || {},
  };
  return cfg;
}

function setStarboard(guildId, patch) {
  const db = load(FILE);
  const current = getStarboard(guildId);
  db[guildId] = { ...current, ...patch, posted: current.posted };
  save(FILE, db);
  return db[guildId];
}

function disableStarboard(guildId) {
  const db = load(FILE);
  const current = getStarboard(guildId);
  db[guildId] = { ...current, channelId: null };
  save(FILE, db);
  return db[guildId];
}

function isPosted(guildId, messageId) {
  const db = load(FILE);
  return Boolean(db[guildId]?.posted?.[messageId]);
}

function markPosted(guildId, messageId, starboardMessageId) {
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = { ...DEFAULTS, posted: {} };
  if (!db[guildId].posted) db[guildId].posted = {};
  db[guildId].posted[messageId] = starboardMessageId || true;
  save(FILE, db);
}

module.exports = { getStarboard, setStarboard, disableStarboard, isPosted, markPosted, DEFAULTS };
