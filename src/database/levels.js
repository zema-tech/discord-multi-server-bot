const { load, save, dbFile, ensureMigrated } = require('./jsonDb');

/** Load con migrazioni schema (una tantum per versione). */
function loadDb() {
  try {
    return ensureMigrated(FILE, 'levels');
  } catch {
    return load(FILE);
  }
}

const FILE = dbFile('levels');

function xpForLevel(level) {
  return 100 + level * 75; // XP necessari per passare dal livello `level` a `level+1`
}

/** XP totali guadagnati (soglie cumulative + resto). Esatto sulla curva xpForLevel. */
function totalXp(entry = {}) {
  const level = Number.isFinite(entry.level) ? Math.max(0, Math.floor(entry.level)) : 0;
  const xp = Number.isFinite(entry.xp) ? Math.max(0, entry.xp) : 0;
  let cum = 0;
  for (let l = 0; l < level; l += 1) cum += xpForLevel(l);
  return cum + xp;
}

function sanitize(entry = {}) {
  const level = Number.isFinite(entry.level) ? Math.max(0, Math.floor(entry.level)) : 0;
  const xp = Number.isFinite(entry.xp) ? Math.max(0, entry.xp) : 0;
  const messageCount = Number.isFinite(entry.messageCount) ? Math.max(0, Math.floor(entry.messageCount)) : 0;
  const voiceMinutes = Number.isFinite(entry.voiceMinutes) ? Math.max(0, Math.floor(entry.voiceMinutes)) : 0;
  return { ...entry, xp, level, messageCount, voiceMinutes };
}

function getLevel(guildId, userId) {
  const db = loadDb();
  if (!db[guildId]?.[userId]) return { xp: 0, level: 0, messageCount: 0, voiceMinutes: 0 };
  return sanitize(db[guildId][userId]);
}

function addXp(guildId, userId, amount, opts = {}) {
  // Importi non validi (NaN, negativi, infiniti): nessun effetto, nessun record corrotto.
  // ID mancanti: nessun record fantasma 'undefined'.
  if (!guildId || !userId) return { xp: 0, level: 0, messageCount: 0, voiceMinutes: 0, leveledUp: false };
  if (!Number.isFinite(amount) || amount <= 0) return { ...getLevel(guildId, userId), leveledUp: false };
  const messages = opts.messages === undefined ? 1 : Math.max(0, Math.floor(opts.messages) || 0);
  const voiceMin = opts.voiceMinutes === undefined ? 0 : Math.max(0, Math.floor(opts.voiceMinutes) || 0);
  const db = loadDb();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = { xp: 0, level: 0, messageCount: 0, voiceMinutes: 0 };
  const entry = sanitize(db[guildId][userId]);
  entry.xp += amount;
  entry.messageCount += messages;
  entry.voiceMinutes += voiceMin;

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
  const db = loadDb();
  if (!db[guildId]) return [];
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  return Object.entries(db[guildId])
    .map(([id, d]) => {
      const s = sanitize(d);
      return { id, ...s, total: totalXp(s) };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, safeLimit);
}

/** Posizione (1-based) di un utente in classifica. null se mai classificato. */
function getRankPosition(guildId, userId) {
  const db = loadDb();
  if (!db[guildId]?.[userId]) return null;
  const me = totalXp(sanitize(db[guildId][userId]));
  let pos = 1;
  for (const [, d] of Object.entries(db[guildId])) {
    if (totalXp(sanitize(d)) > me) pos += 1;
  }
  return pos;
}

module.exports = { getLevel, addXp, getLeaderboard, getRankPosition, xpForLevel, totalXp };
