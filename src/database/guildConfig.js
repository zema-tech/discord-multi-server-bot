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

function cloneDefaults() {
  return { ...DEFAULTS, automod: { ...DEFAULTS.automod } };
}

function getGuild(guildId) {
  // guildId falsy (DM / input null): default in memoria, MAI record 'undefined'/'null'.
  if (!guildId) return cloneDefaults();
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = cloneDefaults();
    save(FILE, db);
  }
  const stored = db[guildId];
  // automod corrotto (stringa/array): solo oggetti vengono mergiati, altrimenti default.
  const automod = stored.automod && typeof stored.automod === 'object' && !Array.isArray(stored.automod)
    ? stored.automod
    : {};
  // merge per retro-compatibilità con config vecchie
  const merged = {
    ...DEFAULTS,
    ...stored,
    automod: { ...DEFAULTS.automod, ...automod },
  };
  if (merged.language !== 'it' && merged.language !== 'en') merged.language = DEFAULTS.language;
  return merged;
}

function updateGuild(guildId, patch) {
  if (!guildId) throw new Error('guildId mancante.');
  const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const db = load(FILE);
  const current = getGuild(guildId);
  const automodPatch =
    safePatch.automod && typeof safePatch.automod === 'object' && !Array.isArray(safePatch.automod)
      ? safePatch.automod
      : {};
  db[guildId] = {
    ...current,
    ...safePatch,
    automod: { ...current.automod, ...automodPatch },
  };
  save(FILE, db);
  return db[guildId];
}

module.exports = { getGuild, updateGuild, DEFAULTS };
