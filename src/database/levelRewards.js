const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('levelRewards');

// Formato: { [guildId]: { [level]: roleId } }

function guildRewards(guildId) {
  // guildId falsy: mappa volatile senza save (niente record 'undefined').
  if (!guildId) return {};
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = {};
    save(FILE, db);
  }
  return db[guildId];
}

function persist(guildId, rewards) {
  if (!guildId) return;
  const db = load(FILE);
  db[guildId] = rewards;
  save(FILE, db);
}

function validLevel(level) {
  const n = Math.floor(Number(level));
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : null;
}

function getReward(guildId, level) {
  const n = validLevel(level);
  if (n === null) return null;
  return guildRewards(guildId)[String(n)] || null;
}

function setReward(guildId, level, roleId) {
  if (!guildId) throw new Error('guildId mancante.');
  const n = validLevel(level);
  if (n === null) throw new Error('Livello non valido (1-100).');
  if (typeof roleId !== 'string' || !roleId) throw new Error('roleId non valido.');
  const rewards = guildRewards(guildId);
  rewards[String(n)] = roleId;
  persist(guildId, rewards);
  return { level: n, roleId };
}

function removeReward(guildId, level) {
  const n = validLevel(level);
  if (n === null) throw new Error('Livello non valido (1-100).');
  const rewards = guildRewards(guildId);
  const existed = Object.prototype.hasOwnProperty.call(rewards, String(n));
  delete rewards[String(n)];
  persist(guildId, rewards);
  return existed;
}

function listRewards(guildId) {
  const rewards = guildRewards(guildId);
  return Object.entries(rewards)
    .map(([level, roleId]) => ({ level: Number(level), roleId }))
    .filter((r) => validLevel(r.level) !== null && typeof r.roleId === 'string')
    .sort((a, b) => a.level - b.level);
}

// Tutti i premi con level <= newLevel (per assegnazione al levelup).
function rewardsUpTo(guildId, newLevel) {
  const n = Math.floor(Number(newLevel));
  if (!Number.isFinite(n)) return [];
  return listRewards(guildId).filter((r) => r.level <= n);
}

module.exports = { getReward, setReward, removeReward, listRewards, rewardsUpTo, validLevel };
