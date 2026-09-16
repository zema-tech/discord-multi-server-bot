const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');
const { addXp } = require('../database/levels');
const { addWarn } = require('../database/warnings');

const INVITE_RE = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/\S+/i;
const LINK_RE = /https?:\/\/\S+/i;

//Cooldown XP per utente (evita farm): 60s
const xpCooldown = new Map();

function hasCaps(msg, pct) {
  const letters = (msg.match(/[a-zA-Zà-ÿÀ-ß]/g) || []).length;
  if (letters < 10) return false;
  const upper = (msg.match(/[A-ZÀ-Þ]/g) || []).length;
  return (upper / letters) * 100 >= pct;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;
    const cfg = getGuild(message.guild.id);

    // ---------- XP / leveling ----------
    if (cfg.levelupEnabled) {
      const key = `${message.guild.id}:${message.author.id}`;
      if (!xpCooldown.has(key) || Date.now() - xpCooldown.get(key) > 60000) {
        // Evita crescita illimitata della mappa in memoria
        if (xpCooldown.size > 5000) {
          const cutoff = Date.now() - 60000;
          for (const [k, t] of xpCooldown) if (t < cutoff) xpCooldown.delete(k);
        }
        xpCooldown.set(key, Date.now());
        const gained = 10 + Math.floor(Math.random() * 11); // 10-20 XP
        const res = addXp(message.guild.id, message.author.id, gained);
        if (res.leveledUp) {
          const text = `🎉 ${message.author} è salito al **livello ${res.level}**!`;
          const targetId = cfg.levelupChannelId || message.channelId;
          const ch = message.guild.channels.cache.get(targetId);
          if (ch?.isTextBased()) ch.send(text).catch(() => {});
        }
      }
    }

    // ---------- Automoderazione ----------
    if (!cfg.automod.enabled) return;
    // member null (permessi sconosciuti) = esente: mai punire quando non si può verificare lo staff
    if (!message.member || message.member.permissions.has('ManageMessages')) return; // lo staff è esente
    const { automod } = cfg;
    const content = message.content || '';

    const violations = [];
    if (automod.antiInvite && INVITE_RE.test(content)) violations.push('invito Discord');
    else if (automod.antiLink && LINK_RE.test(content)) violations.push('link esterno');

    const badWords = Array.isArray(automod.badWords) ? automod.badWords : [];
    const bad = badWords.find((w) => typeof w === 'string' && w && content.toLowerCase().includes(w.toLowerCase()));
    if (bad) violations.push('parola vietata');

    const mentions = message.mentions.users.size + message.mentions.roles.size;
    const maxMentions = Number.isFinite(automod.maxMentions) ? automod.maxMentions : 5;
    if (mentions > maxMentions) violations.push('troppi mention');

    const maxCaps = Number.isFinite(automod.maxCapsPercent) ? automod.maxCapsPercent : 80;
    if (hasCaps(content, maxCaps)) violations.push('caps eccessivo');

    // Anti-spam: 5+ messaggi in 5 secondi
    if (automod.antiSpam) {
      if (!client.spamMap) client.spamMap = new Map();
      const gKey = message.guild.id;
      if (!client.spamMap.has(gKey)) client.spamMap.set(gKey, new Map());
      const map = client.spamMap.get(gKey);
      const arr = (map.get(message.author.id) || []).filter((t) => Date.now() - t < 5000);
      arr.push(Date.now());
      map.set(message.author.id, arr);
      if (arr.length >= 5) {
        violations.push('spam');
        map.set(message.author.id, []);
      }
    }

    if (!violations.length) return;

    try {
      await message.delete().catch(() => {});
    } catch {}
    const warn = addWarn(message.guild.id, message.author.id, {
      modId: client.user.id,
      reason: `Automod: ${violations.join(', ')}`,
    });
    const total = require('../database/warnings').getWarnings(message.guild.id, message.author.id).length;
    const reply = await message.channel
      .send(`⚠️ ${message.author}, messaggio rimosso (**${violations.join(', ')}**). Warn #${total} (ID \`${warn.id}\`).`)
      .catch(() => null);
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000);

    // Muto automatico se 3+ warn totali e moderabile
    if (total >= 3 && message.member?.moderatable) {
      await message.member.timeout(10 * 60 * 1000, 'Automod: 3 warn raggiunti').catch(() => {});
    }
  },
};
