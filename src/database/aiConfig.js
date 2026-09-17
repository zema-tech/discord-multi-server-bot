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
  const merged = { ...DEFAULTS, ...stored };
  if (!Array.isArray(merged.mentionChannels)) merged.mentionChannels = [];
  if (typeof merged.mentionReply !== 'boolean') merged.mentionReply = false;
  if (typeof merged.automodAI !== 'boolean') merged.automodAI = false;
  if (typeof merged.ticketAI !== 'boolean') merged.ticketAI = true;
  if (typeof merged.funAI !== 'boolean') merged.funAI = true;
  if (merged.systemPrompt !== null && typeof merged.systemPrompt !== 'string') merged.systemPrompt = null;
  return merged;
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
  const next = { ...current, ...safePatch };
  if (!Array.isArray(next.mentionChannels)) next.mentionChannels = [];
  db[guildId] = next;
  save(FILE, db);
  return { ...next, mentionChannels: [...next.mentionChannels] };
}

module.exports = { getConfig, setConfig, DEFAULTS };
