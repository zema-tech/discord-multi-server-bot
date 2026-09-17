const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('cases');

const CASE_TYPES = ['warn', 'kick', 'ban', 'timeout', 'unban', 'note', 'mute'];

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.userId !== 'string' || !raw.userId) return null;
  const type = CASE_TYPES.includes(raw.type) ? raw.type : 'note';
  return {
    id: String(raw.id ?? ''),
    type,
    userId: raw.userId,
    modId: typeof raw.modId === 'string' ? raw.modId : 'unknown',
    reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 1024) : 'Nessun motivo specificato',
    at: Number.isFinite(raw.at) ? raw.at : Date.now(),
    ...(raw.meta && typeof raw.meta === 'object' ? { meta: raw.meta } : {}),
  };
}

// MAI lanciare se il DB è sporco: ripara in memoria, non salva qui.
function guildData(guildId) {
  let db = null;
  try {
    db = load(FILE);
  } catch {
    db = {};
  }
  if (!db || typeof db !== 'object' || Array.isArray(db)) db = {};
  let g = db[guildId];
  if (!g || typeof g !== 'object' || Array.isArray(g)) g = { counter: 0, items: {} };
  if (!Number.isFinite(g.counter) || g.counter < 0) g.counter = 0;
  if (!g.items || typeof g.items !== 'object' || Array.isArray(g.items)) g.items = {};
  for (const [id, raw] of Object.entries(g.items)) {
    const clean = sanitizeItem({ ...raw, id });
    if (!clean) delete g.items[id];
    else g.items[id] = clean;
  }
  return { db, data: g };
}

function persist(guildId, db, data) {
  db[guildId] = data;
  save(FILE, db);
}

function logCase(guildId, { type, userId, modId, reason, meta } = {}) {
  if (!guildId || typeof userId !== 'string' || !userId) return null;
  const { db, data } = guildData(guildId);
  data.counter += 1;
  const entry = sanitizeItem({
    id: String(data.counter),
    type,
    userId,
    modId,
    reason,
    at: Date.now(),
    meta,
  });
  data.items[entry.id] = entry;
  persist(guildId, db, data);
  return entry;
}

function getCase(guildId, id) {
  if (!guildId || id === undefined || id === null) return null;
  return guildData(guildId).data.items[String(id)] || null;
}

function sortedItems(data) {
  return Object.values(data.items).sort((a, b) => Number(b.id) - Number(a.id));
}

function getUserCases(guildId, userId, limit = 10) {
  if (!guildId || !userId) return [];
  const n = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Number(limit))) : 10;
  return sortedItems(guildData(guildId).data)
    .filter((c) => c.userId === userId)
    .slice(0, n);
}

function searchCases(guildId, { userId, type, limit = 10 } = {}) {
  if (!guildId) return [];
  const n = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Number(limit))) : 10;
  return sortedItems(guildData(guildId).data)
    .filter((c) => (!userId || c.userId === userId) && (!type || c.type === type))
    .slice(0, n);
}

function addNote(guildId, a, b) {
  // Supporta addNote(guildId, { userId, modId, reason, meta }) e addNote(guildId, userId, { modId, reason, meta }).
  if (typeof a === 'object' && a !== null) {
    return logCase(guildId, { ...a, type: 'note' });
  }
  return logCase(guildId, { userId: a, ...(b || {}), type: 'note' });
}

function removeCase(guildId, id) {
  if (!guildId || id === undefined || id === null) return false;
  const { db, data } = guildData(guildId);
  const key = String(id);
  if (!data.items[key]) return false;
  delete data.items[key];
  persist(guildId, db, data);
  return true;
}

module.exports = { CASE_TYPES, logCase, getCase, getUserCases, addNote, removeCase, searchCases };
