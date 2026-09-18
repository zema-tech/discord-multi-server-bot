const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('tempvoice');

const DEFAULT_CONFIG = {
  lobbyChannelId: null,
  categoryId: null,
};

function guildData(guildId) {
  // guildId falsy: default in memoria senza save (niente record 'undefined').
  if (!guildId) return { config: { ...DEFAULT_CONFIG }, tempChannels: {} };
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = { config: { ...DEFAULT_CONFIG }, tempChannels: {} };
    save(FILE, db);
  }
  if (!db[guildId].config || typeof db[guildId].config !== 'object') db[guildId].config = { ...DEFAULT_CONFIG };
  if (!db[guildId].tempChannels || typeof db[guildId].tempChannels !== 'object') db[guildId].tempChannels = {};
  return db[guildId];
}

function persist(guildId, data) {
  if (!guildId) return;
  const db = load(FILE);
  db[guildId] = data;
  save(FILE, db);
}

function getConfig(guildId) {
  return { ...DEFAULT_CONFIG, ...guildData(guildId).config };
}

function setConfig(guildId, patch) {
  const data = guildData(guildId);
  data.config = { ...DEFAULT_CONFIG, ...data.config, ...patch };
  persist(guildId, data);
  return data.config;
}

function disable(guildId) {
  const data = guildData(guildId);
  data.config = { ...DEFAULT_CONFIG };
  persist(guildId, data);
  return data.config;
}

function saveTemp(guildId, channelId, info) {
  // ID mancanti: niente chiave 'undefined', ritorna null.
  if (!guildId || typeof channelId !== 'string' || !channelId) return null;
  const data = guildData(guildId);
  data.tempChannels[channelId] = {
    ownerId: typeof info?.ownerId === 'string' && info.ownerId ? info.ownerId : null,
  };
  persist(guildId, data);
  return data.tempChannels[channelId];
}

function getTemp(guildId, channelId) {
  if (!channelId) return null;
  return guildData(guildId).tempChannels[channelId] || null;
}

function removeTemp(guildId, channelId) {
  if (!channelId) return false;
  const data = guildData(guildId);
  if (!data.tempChannels[channelId]) return false;
  delete data.tempChannels[channelId];
  persist(guildId, data);
  return true;
}

function isTemp(guildId, channelId) {
  return Boolean(guildData(guildId).tempChannels[channelId]);
}

function getTempChannels(guildId) {
  return { ...guildData(guildId).tempChannels };
}

module.exports = {
  getConfig,
  setConfig,
  disable,
  saveTemp,
  getTemp,
  removeTemp,
  isTemp,
  getTempChannels,
};
