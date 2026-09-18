const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('aiConfig');

const DEFAULTS = {
  mentionReply: false,
  mentionChannels: [],
  automodAI: false,
  systemPrompt: null,
  ticketAI: true,
  funAI: true,
};

function cloneDefaults() {
  return { ...DEFAULTS, mentionChannels: [...DEFAULTS.mentionChannels] };
}

const MAX_MENTION_CHANNELS = 50;
const MAX_SYSTEM_PROMPT = 2000;

// Coerce i tipi noti; le chiavi sconosciute (es. 'model' di altri agenti/test)
// passano invariate per retrocompatibilità.
function sanitizeKnown(cfg) {
  if (!Array.isArray(cfg.mentionChannels)) cfg.mentionChannels = [];
  else {
    cfg.mentionChannels = cfg.mentionChannels
      .filter((c) => typeof c === 'string' && c)
      .map((c) => c.slice(0, 64))
      .slice(0, MAX_MENTION_CHANNELS);
  }
  if (typeof cfg.mentionReply !== 'boolean') cfg.mentionReply = false;
  if (typeof cfg.automodAI !== 'boolean') cfg.automodAI = false;
  if (typeof cfg.ticketAI !== 'boolean') cfg.ticketAI = true;
  if (typeof cfg.funAI !== 'boolean') cfg.funAI = true;
  if (cfg.systemPrompt !== null && typeof cfg.systemPrompt !== 'string') cfg.systemPrompt = null;
  if (typeof cfg.systemPrompt === 'string') cfg.systemPrompt = cfg.systemPrompt.slice(0, MAX_SYSTEM_PROMPT) || null;
  return cfg;
}

/**
 * Config AI per guild, con merge retrocompatibile.
 * @param {string|null|undefined} guildId
 * @returns {{mentionReply:boolean,mentionChannels:string[],automodAI:boolean,systemPrompt:string|null,ticketAI:boolean,funAI:boolean}}
 */
function getConfig(guildId) {
  if (!guildId) return cloneDefaults();
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = cloneDefaults();
    save(FILE, db);
    return cloneDefaults();
  }
  const stored = db[guildId] && typeof db[guildId] === 'object' ? db[guildId] : {};
  const merged = sanitizeKnown({ ...DEFAULTS, ...stored });
  // Copia difensiva: il caller non deve mutare l'array persistito via reference.
  return { ...merged, mentionChannels: [...merged.mentionChannels] };
}

/**
 * Aggiorna la config AI della guild (patch parziale).
 * @param {string} guildId
 * @param {object} [patch]
 * @returns config aggiornata
 */
function setConfig(guildId, patch = {}) {
  if (!guildId) throw new Error('guildId mancante.');
  const safePatch = patch && typeof patch === 'object' ? patch : {};
  const db = load(FILE);
  const current = getConfig(guildId);
  const next = sanitizeKnown({ ...current, ...safePatch });
  db[guildId] = next;
  save(FILE, db);
  return { ...next, mentionChannels: [...next.mentionChannels] };
}

module.exports = { getConfig, setConfig, DEFAULTS };
