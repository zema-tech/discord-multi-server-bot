const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('levels');

function xpForLevel(level) {
  return 100 + level * 75; // XP necessari per passare dal livello `level` a `level+1`
}

function sanitize(entry = {}) {
  const level = Number.isFinite(entry.level) ? Math.max(0, Math.floor(entry.level)) : 0;
  const xp = Number.isFinite(entry.xp) ? Math.max(0, entry.xp) : 0;
  const messageCount = Number.isFinite(entry.messageCount) ? Math.max(0, Math.floor(entry.messageCount)) : 0;
  return { ...entry, xp, level, messageCount };
}

function getLevel(guildId, userId) {
  const db = load(FILE);
  if (!db[guildId]?.[userId]) return { xp: 0, level: 0, messageCount: 0 };
  return sanitize(db[guildId][userId]);
}

function addXp(guildId, userId, amount) {
  // Importi non validi (NaN, negativi, infiniti): nessun effetto, nessun record corrotto.
  if (!Number.isFinite(amount) || amount <= 0) return { ...getLevel(guildId, userId), leveledUp: false };
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = { xp: 0, level: 0, messageCount: 0 };
  const entry = sanitize(db[guildId][userId]);
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
  db[guildId][userId] = entry;
  save(FILE, db);
  return { ...entry, leveledUp };
}

function getLeaderboard(guildId, limit = 10) {
  const db = load(FILE);
  if (!db[guildId]) return [];
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  return Object.entries(db[guildId])
    .map(([id, d]) => {
      const s = sanitize(d);
      return { id, ...s, total: s.level * 1000 + s.xp };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, safeLimit);
}

module.exports = { getLevel, addXp, getLeaderboard, xpForLevel };
