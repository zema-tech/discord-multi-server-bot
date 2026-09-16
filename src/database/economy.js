const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('economy');

function getUser(guildId, userId) {
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) {
    db[guildId][userId] = { balance: 0, bank: 0, lastDaily: 0, lastWork: 0, lastSlots: 0, lastRob: 0 };
    save(FILE, db);
  }
  return db[guildId][userId];
}

function updateUser(guildId, userId, data) {
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  db[guildId][userId] = { ...getUser(guildId, userId), ...data };
  save(FILE, db);
  return db[guildId][userId];
}

function addBalance(guildId, userId, amount) {
  const u = getUser(guildId, userId);
  return updateUser(guildId, userId, { balance: Math.max(0, u.balance + amount) });
}

function getLeaderboard(guildId, limit = 10) {
  const db = load(FILE);
  if (!db[guildId]) return [];
  return Object.entries(db[guildId])
    .map(([id, data]) => ({ id, balance: (data.balance || 0) + (data.bank || 0) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

module.exports = { getUser, updateUser, addBalance, getLeaderboard };
