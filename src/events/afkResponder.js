const { Events, EmbedBuilder } = require('discord.js');
const { getAfk, clearAfk } = require('../database/afk');

// Anti-spam risposte AFK: stesso autore menzionato, max 1 ping ogni 60s.
const cooldowns = new Map();
const COOLDOWN_MS = 60000;

function ago(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h fa`;
  return `${Math.floor(h / 24)} g fa`;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message.guild || !message.author || message.author.bot) return;
      if (message.system) return;
      try {
        if (!require('../modules/commander').canRun(message.guild.id, 'fun').ok) return;
      } catch {}
      const gid = message.guild.id;

      // Torna dal AFK scrivendo (silenzioso, niente spam in chat).
      try {
        if (getAfk(gid, message.author.id)) {
          clearAfk(gid, message.author.id);
          await message.react('👋').catch(() => {});
        }
      } catch {}

      // Menzioni di utenti AFK: un embed sobrio per menzionato (cooldown).
      let mentioned = null;
      try {
        mentioned = message.mentions?.users?.filter((u) => !u.bot && u.id !== message.author.id);
      } catch {
        return;
      }
      if (!mentioned || !mentioned.size) return;
      const now = Date.now();
      if (cooldowns.size > 5000) {
        for (const [k, t] of cooldowns) if (now - t > COOLDOWN_MS) cooldowns.delete(k);
      }
      const lines = [];
      for (const [, u] of mentioned) {
        const key = `${gid}:${u.id}`;
        if (cooldowns.has(key) && now - cooldowns.get(key) < COOLDOWN_MS) continue;
        let st = null;
        try {
          st = getAfk(gid, u.id);
        } catch {}
        if (!st) continue;
        cooldowns.set(key, now);
        lines.push(`💤 **${u.username}** è via da ${ago(st.at || now)}${st.reason ? `: _${st.reason.slice(0, 150)}_` : ''}`);
        if (lines.length >= 3) break;
      }
      if (!lines.length) return;
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setTimestamp();
      await message.reply({ embeds: [embed] }).catch(() => {});
    } catch {}
  },
};
