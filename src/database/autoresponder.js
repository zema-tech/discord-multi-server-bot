const crypto = require('crypto');
const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('autoresponder');

const MAX_TRIGGERS = 50;
const MAX_RESPONSE = 1500;
const MODES = ['include', 'exact', 'regex'];

function readAll() {
  const db = load(FILE);
  return typeof db === 'object' && db !== null ? db : {};
}

function listTriggers(guildId) {
  const db = readAll();
  const list = db[guildId];
  return Array.isArray(list) ? [...list] : [];
}

function makeId(existing) {
  const seen = new Set(existing.map((t) => t.id));
  let id = '';
  do {
    id = crypto.randomBytes(3).toString('hex');
  } while (seen.has(id));
  return id;
}

function addTrigger(guildId, { match, response, mode = 'include', caseSensitive = false } = {}) {
  if (!guildId) return { ok: false, error: 'Server non valido.' };
  const list = listTriggers(guildId);

  if (typeof match !== 'string' || !match.trim()) {
    return { ok: false, error: 'La parola/pattern non può essere vuota.' };
  }
  if (typeof response !== 'string' || !response.trim()) {
    return { ok: false, error: 'La risposta non può essere vuota.' };
  }
  if (response.length > MAX_RESPONSE) {
    return { ok: false, error: `Risposta troppo lunga (max ${MAX_RESPONSE} caratteri).` };
  }
  if (!MODES.includes(mode)) {
    return { ok: false, error: `Modalità non valida (usa: ${MODES.join('|')}).` };
  }
  if (list.length >= MAX_TRIGGERS) {
    return { ok: false, error: `Limite raggiunto (max ${MAX_TRIGGERS} trigger per server).` };
  }
  if (mode === 'regex') {
    try {
      new RegExp(match);
    } catch {
      return { ok: false, error: 'Regex non valida.' };
    }
  }

  const trigger = {
    id: makeId(list),
    match: match.trim(),
    response,
    mode,
    caseSensitive: Boolean(caseSensitive),
  };
  const db = readAll();
  db[guildId] = [...list, trigger];
  save(FILE, db);
  return { ok: true, trigger };
}

function removeTrigger(guildId, id) {
  const list = listTriggers(guildId);
  const filtered = list.filter((t) => t.id !== id);
  if (filtered.length === list.length) return false;
  const db = readAll();
  db[guildId] = filtered;
  save(FILE, db);
  return true;
}

function clearTriggers(guildId) {
  const list = listTriggers(guildId);
  const db = readAll();
  db[guildId] = [];
  save(FILE, db);
  return list.length;
}

module.exports = {
  listTriggers,
  addTrigger,
  removeTrigger,
  clearTriggers,
  MAX_TRIGGERS,
  MAX_RESPONSE,
  MODES,
};
