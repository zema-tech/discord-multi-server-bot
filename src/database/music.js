/**
 * music.js — config musica per server (letta da /musica, modificabile da dashboard).
 * Solo chiavi reali: defaultVolume applicato all'avvio di ogni play.
 */
const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('music');

const DEFAULTS = { defaultVolume: 100 };

function clampInt(v, min, max, fb) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fb;
}

function getConfig(guildId) {
  try {
    const db = load(FILE);
    const raw = (guildId && db[guildId] && typeof db[guildId] === 'object') ? db[guildId] : {};
    return { defaultVolume: clampInt(raw.defaultVolume, 0, 100, DEFAULTS.defaultVolume) };
  } catch {
    return { ...DEFAULTS };
  }
}

function setConfig(guildId, patch = {}) {
  if (!guildId) throw new Error('guildId mancante.');
  const safe = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const next = { ...getConfig(guildId) };
  if (safe.defaultVolume !== undefined) next.defaultVolume = clampInt(safe.defaultVolume, 0, 100, next.defaultVolume);
  const db = load(FILE);
  db[guildId] = next;
  save(FILE, db);
  return { ...next };
}

module.exports = { getConfig, setConfig, DEFAULTS };
