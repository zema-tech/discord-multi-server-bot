const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('birthdays');

// Shape: { [guildId]: { users: { [userId]: 'MM-DD' }, channelId, lastRun } }

/** 'GG/MM' -> 'MM-DD' o null. */
function parseDay(input) {
  const m = /^\s*(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.]\d{2,4})?\s*$/.exec(String(input || ''));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a < 1 || a > 31 || b < 1 || b > 12) return null;
  // Formato italiano GG/MM (giorno prima, mese dopo).
  const dd = String(a).padStart(2, '0');
  const mm = String(b).padStart(2, '0');
  // Sanity giorni-per-mese (semplice, 29 feb ok).
  const dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][b - 1];
  if (a > dim) return null;
  return `${mm}-${dd}`;
}

function guildData(guildId) {
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = { users: {}, channelId: null, lastRun: null };
    save(FILE, db);
  }
  const g = db[guildId];
  if (!g.users || typeof g.users !== 'object' || Array.isArray(g.users)) g.users = {};
  return { db, g };
}

/** Imposta il compleanno. Ritorna 'MM-DD'. Lancia su data non valida. */
function setBirthday(guildId, userId, input) {
  const md = parseDay(input);
  if (!md) throw new Error('Data non valida. Usa GG/MM (es. 25/12).');
  const { db, g } = guildData(guildId);
  g.users[userId] = md;
  save(FILE, db);
  return md;
}

function removeBirthday(guildId, userId) {
  const { db, g } = guildData(guildId);
  if (g.users[userId] === undefined) return false;
  delete g.users[userId];
  save(FILE, db);
  return true;
}

function getBirthday(guildId, userId) {
  try {
    return guildData(guildId).g.users[userId] || null;
  } catch {
    return null;
  }
}

/** Tutti i compleanni (per lista). [{ userId, md }]. */
function listBirthdays(guildId) {
  try {
    return Object.entries(guildData(guildId).g.users).map(([userId, md]) => ({ userId, md }));
  } catch {
    return [];
  }
}

function setChannel(guildId, channelId) {
  const { db, g } = guildData(guildId);
  g.channelId = typeof channelId === 'string' && channelId ? channelId : null;
  save(FILE, db);
  return g.channelId;
}

/** Utenti il cui compleanno è `date` (default oggi). */
function birthdaysOn(guildId, date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  return listBirthdays(guildId).filter((b) => b.md === key);
}

module.exports = { parseDay, setBirthday, removeBirthday, getBirthday, listBirthdays, setChannel, birthdaysOn };
