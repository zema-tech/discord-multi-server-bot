const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('starboard');

const DEFAULTS = {
  channelId: null,
  threshold: 3,
  emoji: '⭐',
};

// Max post tracciati: posted cresce di 1 per messaggio in evidenza e non viene mai potato.
const MAX_POSTED = 500;

function sanitizeCfg(raw = {}) {
  const threshold = Number.isFinite(raw.threshold) ? Math.min(Math.max(1, Math.floor(raw.threshold)), 100) : DEFAULTS.threshold;
  const emoji = typeof raw.emoji === 'string' && raw.emoji.trim() ? raw.emoji.slice(0, 50) : DEFAULTS.emoji;
  const channelId = typeof raw.channelId === 'string' && raw.channelId ? raw.channelId : null;
  return { threshold, emoji, channelId };
}

function getStarboard(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { ...DEFAULTS, posted: {} };
    save(FILE, db);
  }
  // sanitize retrocompatibile: JSON corrotto (soglia "abc"/-5) romperebbe il confronto count < threshold.
  const cfg = {
    ...DEFAULTS,
    ...db[guildId],
    ...sanitizeCfg(db[guildId]),
    posted: db[guildId].posted && typeof db[guildId].posted === 'object' ? db[guildId].posted : {},
  };
  return cfg;
}

function setStarboard(guildId, patch) {
  const db = load(FILE);
  const current = getStarboard(guildId);
  db[guildId] = { ...current, ...sanitizeCfg({ ...current, ...patch }), posted: current.posted };
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
  if (!db[guildId].posted || typeof db[guildId].posted !== 'object') db[guildId].posted = {};
  db[guildId].posted[messageId] = starboardMessageId || true;
  // Potatura: tieni solo gli ultimi MAX_POSTED (il JSON cresceva all'infinito).
  const keys = Object.keys(db[guildId].posted);
  if (keys.length > MAX_POSTED) {
    const keep = new Set(keys.slice(-MAX_POSTED));
    for (const k of keys) if (!keep.has(k)) delete db[guildId].posted[k];
  }
  save(FILE, db);
}

module.exports = { getStarboard, setStarboard, disableStarboard, isPosted, markPosted, DEFAULTS };
