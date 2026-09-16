const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('stanze');

const MAX_PER_USER = 3;

function guildData(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { rooms: {} };
    save(FILE, db);
  }
  if (!db[guildId].rooms) db[guildId].rooms = {};
  return db[guildId];
}

function persist(guildId, data) {
  const db = load(FILE);
  db[guildId] = data;
  save(FILE, db);
}

function saveRoom(guildId, channelId, info) {
  const data = guildData(guildId);
  data.rooms[channelId] = { ownerId: info.ownerId, type: info.type };
  persist(guildId, data);
  return data.rooms[channelId];
}

function getRoom(guildId, channelId) {
  return guildData(guildId).rooms[channelId] || null;
}

function removeRoom(guildId, channelId) {
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
  return Object.entries(guildData(guildId).rooms)
    .filter(([, r]) => r.ownerId === userId)
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
