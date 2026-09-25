const { Events } = require('discord.js');
const { askAI } = require('../ai/ai');

// Cooldown anti-spam: guildId:userId -> timestamp (20s per utente).
const cooldowns = new Map();
const COOLDOWN_MS = 20000;
const MAX_REPLY_CHARS = 1500;

function getAIConfig(guildId) {
  const defaults = { ticketAI: true, funAI: true, mentionReply: true, mentionChannels: [], systemPrompt: '' };
  try {
    const mod = require('../database/aiConfig');
    const cfg =
      mod && typeof mod.getAIConfig === 'function'
        ? mod.getAIConfig(guildId)
        : mod && typeof mod.getConfig === 'function'
          ? mod.getConfig(guildId)
          : mod;
    if (cfg && typeof cfg === 'object') return { ...defaults, ...cfg };
  } catch {}
  return { ...defaults };
}

function pruneCooldowns() {
  if (cooldowns.size <= 5000) return;
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const [k, t] of cooldowns) {
    if (t < cutoff) cooldowns.delete(k);
    if (cooldowns.size <= 4000) break;
  }
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (!message.guild || !message.author || message.author.bot) return;
      if (message.system) return;
      if (!client?.user) return;
      // Controller feature 'ai' (default on, mai crashare).
      try {
        if (!require('../modules/commander').canRun(message.guild.id, 'ai').ok) return;
      } catch {}

      // Solo menzione diretta del bot: niente reply-all (@everyone/@here) e niente bot.
      let mentioned = false;
      try {
        mentioned = message.mentions?.has(client.user, { ignoreEveryone: true }) || false;
      } catch {
        return;
      }
      if (!mentioned) return;
      if (message.mentions?.everyone) return;

      const content = String(message.content || '').trim();
      if (!content) return;

      let cfg;
      try {
        cfg = getAIConfig(message.guild.id);
      } catch {
        return;
      }
      if (!cfg.mentionReply) return;
      if (Array.isArray(cfg.mentionChannels) && cfg.mentionChannels.length > 0) {
        if (!cfg.mentionChannels.includes(message.channelId)) return;
      }

      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      if (cooldowns.has(key) && now - cooldowns.get(key) < COOLDOWN_MS) return;
      pruneCooldowns();
      cooldowns.set(key, now);

      // Contesto: ultimi 3 messaggi prima di quello corrente.
      let contesto = '';
      try {
        const prev = await message.channel.messages.fetch({ limit: 3, before: message.id });
        contesto = [...prev.values()]
          .reverse()
          .map((m) => {
            const autore = m.author ? m.author.username : 'Sconosciuto';
            const testo = String(m.content || '').trim();
            return testo ? `${autore}: ${testo}` : '';
          })
          .filter(Boolean)
          .join('\n');
      } catch {}

      const domanda = content.replace(/<@!?\d+>/g, '').trim() || content;
      const prompt = contesto
        ? `Contesto recente del canale:\n${contesto}\n\n${message.author.username} chiede: ${domanda}`
        : `${message.author.username} chiede: ${domanda}`;

      let system = String(cfg.systemPrompt || '').trim()
        || 'Sei un assistente utile del server Discord, rispondi in italiano in modo conciso e cordiale.';
      // Cervello del server: mai rompere il flusso se fallisce.
      try {
        const { buildContext } = require('../ai/brain/kernel');
        const ctx = buildContext({ guildId: message.guild.id, query: domanda, userId: message.author.id, guild: message.guild });
        if (ctx.system) system = `${system}\n\n${ctx.system}`;
      } catch {}

      // Auto-apprendimento: fatti importanti detti dall'utente (mai fatale).
      let learned = '';
      try {
        const { learnFrom } = require('../ai/brain/learn');
        const res = learnFrom(message.guild.id, message.author.id, domanda, message.author.username);
        if (res && res !== 'dup') learned = res;
      } catch {}

      let risposta;
      try {
        risposta = await askAI(prompt, system);
      } catch {
        try {
          await message.reply('⚠️ AI non disponibile, riprova più tardi.');
        } catch {}
        return;
      }

      try {
        const suffix = learned ? `\n\n🧠 *Memorizzato: ${learned.slice(0, 120)}*` : '';
        await message.reply((risposta + suffix).slice(0, MAX_REPLY_CHARS + suffix.length));
      } catch {}
    } catch {}
  },
};
