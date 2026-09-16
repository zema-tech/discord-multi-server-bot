const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('reactionRoles');

const MAX_OPTIONS = 25;

function defaultPanel() {
  return {
    channelId: null,
    messageId: null,
    title: 'Scegli i tuoi ruoli',
    description: 'Seleziona un ruolo dal menu qui sotto per aggiungerlo o rimuoverlo.',
    options: [],
  };
}

function getPanel(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = defaultPanel();
    save(FILE, db);
  }
  const merged = { ...defaultPanel(), ...db[guildId] };
  if (!Array.isArray(merged.options)) merged.options = [];
  return merged;
}

function setPanel(guildId, patch) {
  const db = load(FILE);
  const current = getPanel(guildId);
  db[guildId] = { ...current, ...patch };
  if (!Array.isArray(db[guildId].options)) db[guildId].options = [];
  save(FILE, db);
  return db[guildId];
}

function addOption(guildId, { roleId, label, emoji }) {
  const panel = getPanel(guildId);
  const existing = panel.options.findIndex((o) => o.roleId === roleId);
  if (existing !== -1) {
    panel.options[existing] = { roleId, label, emoji };
    setPanel(guildId, { options: panel.options });
    return { updated: true, added: false, panel: getPanel(guildId) };
  }
  if (panel.options.length >= MAX_OPTIONS) {
    return { added: false, updated: false, full: true, panel };
  }
  panel.options.push({ roleId, label, emoji });
  setPanel(guildId, { options: panel.options });
  return { added: true, updated: false, panel: getPanel(guildId) };
}

function removeOption(guildId, roleId) {
  const panel = getPanel(guildId);
  if (!panel.options.some((o) => o.roleId === roleId)) {
    return { removed: false, panel };
  }
  const options = panel.options.filter((o) => o.roleId !== roleId);
  const updated = setPanel(guildId, { options });
  return { removed: true, panel: updated };
}

function clear(guildId) {
  const db = load(FILE);
  delete db[guildId];
  save(FILE, db);
}

module.exports = {
  MAX_OPTIONS,
  getPanel,
  setPanel,
  addOption,
  removeOption,
  clear,
};
