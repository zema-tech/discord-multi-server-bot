const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('stanze');

const MAX_PER_USER = 3;

function guildData(guildId) {
  // guildId falsy: default in memoria senza save (niente record 'undefined').
  if (!guildId) return { rooms: {} };
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = { rooms: {} };
    save(FILE, db);
  }
  if (!db[guildId].rooms || typeof db[guildId].rooms !== 'object' || Array.isArray(db[guildId].rooms)) {
    db[guildId].rooms = {};
  }
  return db[guildId];
}

function persist(guildId, data) {
  if (!guildId) return;
  const db = load(FILE);
  db[guildId] = data;
  save(FILE, db);
}

function saveRoom(guildId, channelId, info) {
  // ID mancanti: niente chiave 'undefined', ritorna null.
  if (!guildId || typeof channelId !== 'string' || !channelId) return null;
  const data = guildData(guildId);
  data.rooms[channelId] = {
    ownerId: typeof info?.ownerId === 'string' && info.ownerId ? info.ownerId : null,
    type: typeof info?.type === 'string' && info.type ? info.type : null,
  };
  persist(guildId, data);
  return data.rooms[channelId];
}

function getRoom(guildId, channelId) {
  if (!channelId) return null;
  return guildData(guildId).rooms[channelId] || null;
}

function removeRoom(guildId, channelId) {
  if (!channelId) return false;
  const data = guildData(guildId);
  if (!data.rooms[channelId]) return false;
  delete data.rooms[channelId];
  persist(guildId, data);
  return true;
}

function getRooms(guildId) {
  return { ...guildData(guildId).rooms };
}

function getUserRooms(guildId, userId) {
  if (!userId) return [];
  return Object.entries(guildData(guildId).rooms)
    .filter(([, r]) => r && typeof r === 'object' && r.ownerId === userId)
    .map(([channelId, r]) => ({ channelId, ...r }));
}

module.exports = {
  MAX_PER_USER,
  saveRoom,
  getRoom,
  removeRoom,
  getRooms,
  getUserRooms,
};
