const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('guildConfig');

const DEFAULTS = {
  language: 'it', // 'it' | 'en' — gestita da src/utils/i18n.js + /lingua
  welcomeChannelId: null,
  welcomeMessage: '👋 Benvenuto {user} su **{server}**! Ora siamo {count} membri.',
  goodbyeChannelId: null,
  goodbyeMessage: '👋 {user} ha lasciato **{server}**.',
  logChannelId: null,
  suggestChannelId: null,
  automod: {
    enabled: true,
    antiSpam: true,
    antiLink: true,
    antiInvite: true,
    badWords: ['coglione', 'stronzo', 'vaffanculo'],
    maxMentions: 5,
    maxCapsPercent: 80,
  },
  levelupChannelId: null, // null = stesso canale
  levelupEnabled: true,
};

function getGuild(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { ...DEFAULTS, automod: { ...DEFAULTS.automod } };
    save(FILE, db);
  }
  // merge per retro-compatibilità con config vecchie
  const merged = {
    ...DEFAULTS,
    ...db[guildId],
    automod: { ...DEFAULTS.automod, ...(db[guildId].automod || {}) },
  };
  return merged;
}

function updateGuild(guildId, patch) {
  const db = load(FILE);
  const current = getGuild(guildId);
  db[guildId] = {
    ...current,
    ...patch,
    automod: { ...current.automod, ...(patch.automod || {}) },
  };
  save(FILE, db);
  return db[guildId];
}

module.exports = { getGuild, updateGuild, DEFAULTS };
