const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'economy.json');

function loadDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function getUser(guildId, userId) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) {
    db[guildId][userId] = {
      balance: 0,
      lastDaily: 0,
      lastWork: 0,
    };
    saveDB(db);
  }
  return db[guildId][userId];
}

function updateUser(guildId, userId, data) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};
  db[guildId][userId] = { ...getUser(guildId, userId), ...data };
  saveDB(db);
  return db[guildId][userId];
}

function getLeaderboard(guildId, limit = 10) {
  const db = loadDB();
  if (!db[guildId]) return [];

  return Object.entries(db[guildId])
    .map(([id, data]) => ({ id, balance: data.balance || 0 }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

module.exports = { getUser, updateUser, getLeaderboard };
