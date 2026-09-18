const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('autorole');

const DEFAULTS = {
  roleIds: [],
  enabled: true,
  delaySeconds: 0,
};

function getConfig(guildId) {
  // guildId falsy: default in memoria senza save (niente record 'undefined').
  if (!guildId) return { ...DEFAULTS, roleIds: [] };
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = { ...DEFAULTS, roleIds: [] };
    save(FILE, db);
  }
  // merge per retro-compatibilità con config vecchie
  const merged = { ...DEFAULTS, ...db[guildId] };
  if (!Array.isArray(merged.roleIds)) merged.roleIds = [];
  return merged;
}

function setConfig(guildId, patch) {
  if (!guildId) throw new Error('guildId mancante.');
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const db = load(FILE);
  const current = getConfig(guildId);
  db[guildId] = { ...current, ...safePatch };
  if (!Array.isArray(db[guildId].roleIds)) db[guildId].roleIds = [];
  else db[guildId].roleIds = db[guildId].roleIds.filter((r) => typeof r === 'string' && r);
  const d = Math.floor(Number(db[guildId].delaySeconds));
  db[guildId].delaySeconds = Number.isFinite(d) ? Math.min(Math.max(0, d), 3600) : DEFAULTS.delaySeconds;
  db[guildId].enabled = db[guildId].enabled !== false;
  save(FILE, db);
  return db[guildId];
}

function addRole(guildId, roleId) {
  const cfg = getConfig(guildId);
  if (cfg.roleIds.includes(roleId)) return { added: false, config: cfg };
  const config = setConfig(guildId, { roleIds: [...cfg.roleIds, roleId] });
  return { added: true, config };
}

function removeRole(guildId, roleId) {
  const cfg = getConfig(guildId);
  if (!cfg.roleIds.includes(roleId)) return { removed: false, config: cfg };
  const config = setConfig(guildId, { roleIds: cfg.roleIds.filter((id) => id !== roleId) });
  return { removed: true, config };
}

module.exports = { getConfig, setConfig, addRole, removeRole, DEFAULTS };
