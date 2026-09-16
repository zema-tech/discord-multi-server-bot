const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('levels');

function xpForLevel(level) {
  return 100 + level * 75; // XP necessari per passare dal livello `level` a `level+1`
}

function getLevel(guildId, userId) {
  const db = load(FILE);
  if (!db[guildId]?.[userId]) return { xp: 0, level: 0, messageCount: 0 };
  return db[guildId][userId];
}

function addXp(guildId, userId, amount) {
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = { xp: 0, level: 0, messageCount: 0 };
  const entry = db[guildId][userId];
  entry.xp += amount;
  entry.messageCount += 1;

  let leveledUp = false;
  let need = xpForLevel(entry.level);
  while (entry.xp >= need) {
    entry.xp -= need;
    entry.level += 1;
    leveledUp = true;
    need = xpForLevel(entry.level);
  }
  save(FILE, db);
  return { ...entry, leveledUp };
}

function getLeaderboard(guildId, limit = 10) {
  const db = load(FILE);
  if (!db[guildId]) return [];
  return Object.entries(db[guildId])
    .map(([id, d]) => ({ id, ...d, total: d.level * 1000 + d.xp }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

module.exports = { getLevel, addXp, getLeaderboard, xpForLevel };
