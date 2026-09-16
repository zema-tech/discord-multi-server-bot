const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('autorole');

const DEFAULTS = {
  roleIds: [],
  enabled: true,
  delaySeconds: 0,
};

function getConfig(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { ...DEFAULTS, roleIds: [] };
    save(FILE, db);
  }
  // merge per retro-compatibilità con config vecchie
  const merged = { ...DEFAULTS, ...db[guildId] };
  if (!Array.isArray(merged.roleIds)) merged.roleIds = [];
  return merged;
}

function setConfig(guildId, patch) {
  const db = load(FILE);
  const current = getConfig(guildId);
  db[guildId] = { ...current, ...patch };
  if (!Array.isArray(db[guildId].roleIds)) db[guildId].roleIds = [];
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
