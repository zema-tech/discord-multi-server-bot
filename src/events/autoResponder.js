const { Events } = require('discord.js');
const { listTriggers } = require('../database/autoresponder');

// Cooldown anti-spam per utente: guildId:userId -> timestamp. Solo lettura altrove: non tocca altri listener.
const cooldowns = new Map();
const COOLDOWN_MS = 5000;

function pruneCooldowns() {
  if (cooldowns.size <= 5000) return;
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const [k, t] of cooldowns) {
    if (t < cutoff) cooldowns.delete(k);
    if (cooldowns.size <= 4000) break;
  }
}

function matches(content, trigger) {
  const { match, mode, caseSensitive } = trigger;
  try {
    if (mode === 'exact') {
      if (caseSensitive) return content.trim() === match;
      return content.trim().toLowerCase() === String(match).toLowerCase();
    }
    if (mode === 'regex') {
      const flags = caseSensitive ? '' : 'i';
      const re = new RegExp(match, flags);
      return re.test(content);
    }
    // include (default)
    if (caseSensitive) return content.includes(match);
    return content.toLowerCase().includes(String(match).toLowerCase());
  } catch {
    return false;
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Solo lettura: ignora tutto ciò che non è un messaggio testuale di un utente in un server.
    if (!message.guild || !message.author || message.author.bot) return;
    if (message.system) return;
    const content = message.content;
    if (typeof content !== 'string' || !content) return;
    // Controller feature 'autoresponder' (default on, mai crashare).
    try {
      if (!require('../modules/registry').isEnabled(message.guild.id, 'autoresponder')) return;
    } catch {}
    // Lo staff (e gli staff-bot) sono esenti: evita loop di risposta.
    try {
      if (message.member?.permissions?.has('ManageMessages')) return;
    } catch {
      return;
    }

    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    if (cooldowns.has(key) && now - cooldowns.get(key) < COOLDOWN_MS) return;

    let triggers = [];
    try {
      triggers = listTriggers(message.guild.id);
    } catch {
      return;
    }
    if (!triggers.length) return;

    // Primo match in ordine di creazione vince.
    const hit = triggers.find((t) => t && typeof t.match === 'string' && typeof t.response === 'string' && matches(content, t));
    if (!hit) return;

    pruneCooldowns();
    cooldowns.set(key, now);

    const text = hit.response.replaceAll('{user}', `${message.author}`);
    try {
      await message.reply(text);
    } catch {}
  },
};
