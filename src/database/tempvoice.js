const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('tempvoice');

const DEFAULT_CONFIG = {
  lobbyChannelId: null,
  categoryId: null,
};

function guildData(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { config: { ...DEFAULT_CONFIG }, tempChannels: {} };
    save(FILE, db);
  }
  if (!db[guildId].config) db[guildId].config = { ...DEFAULT_CONFIG };
  if (!db[guildId].tempChannels) db[guildId].tempChannels = {};
  return db[guildId];
}

function persist(guildId, data) {
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
  const data = guildData(guildId);
  data.tempChannels[channelId] = { ownerId: info.ownerId };
  persist(guildId, data);
  return data.tempChannels[channelId];
}

function getTemp(guildId, channelId) {
  return guildData(guildId).tempChannels[channelId] || null;
}

function removeTemp(guildId, channelId) {
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
