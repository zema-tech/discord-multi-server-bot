const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('warnings');

function getWarnings(guildId, userId) {
  if (!guildId || !userId) return [];
  const db = load(FILE);
  const list = ((db[guildId] || {})[userId]) || [];
  // DB corrotto (oggetto/stringa al posto dell'array): fallback [] invece di rompere i caller.
  return Array.isArray(list) ? list : [];
}

function makeId(existing) {
  const seen = new Set(existing.map((w) => w && w.id));
  let id = '';
  do {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (seen.has(id));
  return id;
}

function addWarn(guildId, userId, { modId, reason } = {}) {
  if (!guildId || !userId) throw new Error('guildId/userId mancanti.');
  const db = load(FILE);
  if (!db[guildId]) db[guildId] = {};
  if (!Array.isArray(db[guildId][userId])) db[guildId][userId] = [];
  const warn = {
    id: makeId(db[guildId][userId]),
    modId: typeof modId === 'string' && modId ? modId : 'unknown',
    reason: typeof reason === 'string' && reason.trim() ? reason.slice(0, 1000) : 'Nessun motivo specificato',
    at: Date.now(),
  };
  db[guildId][userId].push(warn);
  save(FILE, db);
  return warn;
}

function clearWarnings(guildId, userId) {
  const db = load(FILE);
  if (db[guildId]) {
    delete db[guildId][userId];
    save(FILE, db);
  }
}

function removeWarn(guildId, userId, warnId) {
  if (!guildId || !userId) return false;
  const db = load(FILE);
  if (!Array.isArray(db[guildId]?.[userId])) return false;
  const before = db[guildId][userId].length;
  db[guildId][userId] = db[guildId][userId].filter((w) => w.id !== warnId);
  save(FILE, db);
  return db[guildId][userId].length !== before;
}

// ---------- RED style: azioni automatiche a soglia warn ----------
// [{ warns: 3, action: 'timeout'|'kick'|'ban', minutes }] — max 5 regole.
// Default storico: 3 warn -> timeout 10 minuti.

const WARN_ACTIONS = ['timeout', 'kick', 'ban'];
const MAX_RULES = 5;
const DEFAULT_ACTIONS = [{ warns: 3, action: 'timeout', minutes: 10 }];

function defaultActions() {
  return DEFAULT_ACTIONS.map((r) => ({ ...r }));
}

/** Regole del server (sempre valide e ordinate). Mai lancia. */
function getWarnActions(guildId) {
  try {
    const db = load(FILE);
    const raw = db[guildId]?.actions;
    if (!Array.isArray(raw) || !raw.length) return defaultActions();
    const clean = raw
      .map((r) => ({
        warns: Math.floor(Number(r && r.warns)),
        action: String((r && r.action) || '').toLowerCase().trim(),
        minutes: Math.floor(Number((r && r.minutes) || 0)),
      }))
      .filter((r) => Number.isFinite(r.warns) && r.warns >= 2 && r.warns <= 20 && WARN_ACTIONS.includes(r.action))
      .map((r) => ({ warns: r.warns, action: r.action, minutes: r.action === 'timeout' ? Math.min(Math.max(r.minutes || 10, 1), 40320) : 0 }));
    if (!clean.length) return defaultActions();
    const seen = new Map();
    for (const r of clean) if (!seen.has(r.warns)) seen.set(r.warns, r);
    return [...seen.values()].sort((a, b) => a.warns - b.warns);
  } catch {
    return defaultActions();
  }
}

/** Sostituisce le regole. Lancia su input non valido. */
function setWarnActions(guildId, rules) {
  if (!guildId) throw new Error('guildId mancante.');
  if (!Array.isArray(rules) || !rules.length) throw new Error('Almeno una regola.');
  if (rules.length > MAX_RULES) throw new Error(`Max ${MAX_RULES} regole.`);
  const clean = rules.map((r) => ({
    warns: Math.floor(Number(r && r.warns)),
    action: String((r && r.action) || '').toLowerCase().trim(),
    minutes: Math.floor(Number((r && r.minutes) || 0)),
  }));
  for (const r of clean) {
    if (!Number.isFinite(r.warns) || r.warns < 2 || r.warns > 20) throw new Error('Soglia non valida (2-20 warn).');
    if (!WARN_ACTIONS.includes(r.action)) throw new Error('Azione non valida (timeout/kick/ban).');
    if (r.action === 'timeout' && (!Number.isFinite(r.minutes) || r.minutes < 1 || r.minutes > 40320)) {
      throw new Error('Minuti timeout non validi (1-40320).');
    }
  }
  const warns = clean.map((r) => r.warns);
  if (new Set(warns).size !== warns.length) throw new Error('Soglie duplicate.');
  const sorted = clean
    .map((r) => ({ warns: r.warns, action: r.action, minutes: r.action === 'timeout' ? r.minutes : 0 }))
    .sort((a, b) => a.warns - b.warns);
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) db[guildId] = {};
  db[guildId].actions = sorted;
  save(FILE, db);
  return sorted;
}

/** Regola più alta con soglia <= totale. null se nessuna. */
function actionFor(total, rules) {
  const list = Array.isArray(rules) ? rules : [];
  let best = null;
  for (const r of list) {
    if (Number.isFinite(r.warns) && r.warns <= total && (!best || r.warns > best.warns)) best = r;
  }
  return best;
}

module.exports = { getWarnings, addWarn, clearWarnings, removeWarn, getWarnActions, setWarnActions, actionFor, WARN_ACTIONS, MAX_RULES, DEFAULT_ACTIONS };
