const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('confessioni');

const DEFAULTS = {
  channelId: null,
};

// Anti-abuso: max 1 confessione ogni 60s per utente (in memoria, non persistito).
const COOLDOWN_MS = 60_000;
const lastUse = new Map(); // userId -> timestamp ms

function getConfessioni(guildId) {
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object') {
    db[guildId] = { ...DEFAULTS };
    save(FILE, db);
  }
  const cfg = db[guildId];
  return {
    channelId: typeof cfg.channelId === 'string' && cfg.channelId ? cfg.channelId : null,
  };
}

function setCanale(guildId, channelId) {
  const db = load(FILE);
  db[guildId] = { channelId: typeof channelId === 'string' && channelId ? channelId : null };
  save(FILE, db);
  return db[guildId];
}

function disableConfessioni(guildId) {
  return setCanale(guildId, null);
}

// Secondi restanti di attesa per l'utente (0 = può confessare).
function secondiAttesa(userId, now = Date.now()) {
  const last = lastUse.get(String(userId)) || 0;
  const resto = COOLDOWN_MS - (now - last);
  return resto > 0 ? Math.ceil(resto / 1000) : 0;
}

function registraConfessione(userId, now = Date.now()) {
  lastUse.set(String(userId), now);
}

function _resetCooldowns() {
  lastUse.clear();
}

module.exports = {
  getConfessioni,
  setCanale,
  disableConfessioni,
  secondiAttesa,
  registraConfessione,
  COOLDOWN_MS,
  DEFAULTS,
  _resetCooldowns,
};
