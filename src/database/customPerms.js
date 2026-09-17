const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('customPerms');

const COMMAND_RE = /^[\w-]{1,32}$/;
const MAX_ROLES = 5;
// Chiavi che manipolerebbero il prototype invece di creare una entry (prototype pollution).
const FORBIDDEN_COMMANDS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeCommand(name) {
  if (typeof name !== 'string') return null;
  const n = name.toLowerCase().trim();
  if (!COMMAND_RE.test(n) || FORBIDDEN_COMMANDS.has(n)) return null;
  return n;
}

function readDb() {
  const db = load(FILE);
  return db && typeof db === 'object' ? db : {};
}

function guildEntry(db, guildId) {
  if (!db[guildId] || typeof db[guildId] !== 'object') db[guildId] = {};
  return db[guildId];
}

function cleanRoleIds(roleIds) {
  if (!Array.isArray(roleIds)) return [];
  const seen = new Set();
  for (const id of roleIds) {
    if (typeof id !== 'string' || !/^\d{1,25}$/.test(id)) continue;
    if (!seen.has(id)) seen.add(id);
    if (seen.size >= MAX_ROLES) break;
  }
  return [...seen];
}

function getCommandRoles(guildId, command) {
  const n = normalizeCommand(command);
  if (!guildId || !n) return [];
  const db = readDb();
  const roles = db[guildId]?.[n]?.roleIds;
  return Array.isArray(roles) ? [...roles] : [];
}

function setCommandRoles(guildId, command, roleIds) {
  if (!guildId) throw new Error('guildId mancante.');
  const n = normalizeCommand(command);
  if (!n) throw new Error(`Nome comando non valido: "${command}". Usa 1-32 caratteri (lettere, numeri, _ o -).`);
  const clean = cleanRoleIds(roleIds);
  if (clean.length === 0) throw new Error('Specifica almeno un ruolo valido (max 5).');
  const db = readDb();
  guildEntry(db, guildId)[n] = { roleIds: clean };
  save(FILE, db);
  return [...clean];
}

function clearCommandRoles(guildId, command) {
  const n = normalizeCommand(command);
  if (!guildId || !n) return false;
  const db = readDb();
  if (!db[guildId]?.[n]) return false;
  delete db[guildId][n];
  if (Object.keys(db[guildId]).length === 0) delete db[guildId];
  save(FILE, db);
  return true;
}

function getAll(guildId) {
  if (!guildId) return {};
  const db = readDb();
  const entry = db[guildId];
  if (!entry || typeof entry !== 'object') return {};
  const out = {};
  for (const [cmd, val] of Object.entries(entry)) {
    if (!normalizeCommand(cmd)) continue;
    const roles = val?.roleIds;
    if (Array.isArray(roles) && roles.length > 0) out[cmd] = { roleIds: [...roles] };
  }
  return out;
}

function hasCustom(guildId, command) {
  return getCommandRoles(guildId, command).length > 0;
}

function clearAll(guildId) {
  if (!guildId) return false;
  const db = readDb();
  if (!db[guildId]) return false;
  delete db[guildId];
  save(FILE, db);
  return true;
}

module.exports = {
  MAX_ROLES,
  getCommandRoles,
  setCommandRoles,
  clearCommandRoles,
  getAll,
  hasCustom,
  clearAll,
};
