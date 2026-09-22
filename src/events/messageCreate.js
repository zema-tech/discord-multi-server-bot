const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');
const { addXp } = require('../database/levels');
const { addWarn } = require('../database/warnings');

const INVITE_RE = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/\S+/i;
const LINK_RE = /https?:\/\/\S+/i;

//Cooldown XP per utente (evita farm): 60s
const xpCooldown = new Map();

// Controller feature: interruttore on/off per guild (default on, mai crashare).
function modulesEnabled(guildId, featureId) {
  try {
    return require('../modules/registry').isEnabled(guildId, featureId) !== false;
  } catch {
    return true;
  }
}

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

    // PEAK: attività ticket (throttle 60s dentro touchActivity, mai crashare il flusso).
    try {
      require('../database/tickets').touchActivity(message.guild.id, message.channelId);
    } catch {}

    // ---------- XP / leveling ----------
    // Controller feature 'levels': spento => niente XP né level-up.
    if (cfg.levelupEnabled && modulesEnabled(message.guild.id, 'levels')) {
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
          const ch = message.guild.channels.cache.get(targetId)
            ?? await message.guild.channels.fetch(targetId).catch(() => null);
          if (ch?.isTextBased()) ch.send(text).catch(() => {});
          // PEAK: assegna ruoli premio con level <= nuovo livello (per ruolo, mai crashare il flusso XP).
          try {
            const { rewardsUpTo } = require('../database/levelRewards');
            const member = message.member;
            if (member) {
              for (const r of rewardsUpTo(message.guild.id, res.level)) {
                try {
                  if (member.roles.cache.has(r.roleId)) continue;
                  const role = message.guild.roles.cache.get(r.roleId);
                  if (!role || !role.editable) continue;
                  await member.roles.add(role).catch(() => {});
                } catch {}
              }
            }
          } catch {}
        }
      }
    }

    // ---------- Automoderazione ----------
    // Controller feature 'moderation': spento => nessun filtro (oltre al setting).
    if (!cfg.automod.enabled || !modulesEnabled(message.guild.id, 'moderation')) return;
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
      // Evita crescita illimitata: pota guild/utenti senza timestamp recenti
      if (client.spamMap.size > 200) {
        const now0 = Date.now();
        for (const [g, m] of client.spamMap) {
          for (const [u, arr0] of m) {
            const fresh0 = arr0.filter((t) => now0 - t < 5000);
            if (!fresh0.length) m.delete(u);
            else if (fresh0.length !== arr0.length) m.set(u, fresh0);
          }
          if (m.size === 0) client.spamMap.delete(g);
        }
      }
      const gKey = message.guild.id;
      if (!client.spamMap.has(gKey)) client.spamMap.set(gKey, new Map());
      const map = client.spamMap.get(gKey);
      const arr = (map.get(message.author.id) || []).filter((t) => Date.now() - t < 5000);
      arr.push(Date.now());
      map.set(message.author.id, arr);
      if (arr.length >= 5) {
        violations.push('spam');
        map.delete(message.author.id);
        if (map.size === 0) client.spamMap.delete(gKey);
      }
    }

    if (!violations.length) return;

    try {
      await message.delete().catch(() => {});
    } catch {}
    const botId = client.user?.id;
    if (!botId) return; // senza bot loggato non si può attribuire il warn: messaggio già cancellato
    const warn = addWarn(message.guild.id, message.author.id, {
      modId: botId,
      reason: `Automod: ${violations.join(', ')}`,
    });
    const total = require('../database/warnings').getWarnings(message.guild.id, message.author.id).length;
    const reply = await message.channel
      .send(`⚠️ ${message.author}, messaggio rimosso (**${violations.join(', ')}**). Warn #${total} (ID \`${warn.id}\`).`)
      .catch(() => null);
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000).unref?.();

    // Muto automatico se 3+ warn totali e moderabile
    if (total >= 3 && message.member?.moderatable) {
      await message.member.timeout(10 * 60 * 1000, 'Automod: 3 warn raggiunti').catch(() => {});
    }
  },
};
