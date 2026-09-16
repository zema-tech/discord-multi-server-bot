const { Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { registerJoin } = require('../utils/antiRaid');
const { getGuild } = require('../database/guildConfig');

// Anti-spam avvisi: un embed ogni 5 minuti per guild (il console.warn scatta sempre).
const WARN_COOLDOWN_MS = 5 * 60 * 1000;
const lastWarn = new Map();

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    let state;
    try {
      state = registerJoin(member.guild.id);
    } catch (e) {
      console.error('antiRaid tracker:', e.message);
      return;
    }
    if (!state.alert) return;

    console.warn(
      `[ANTIRAID] Possibile raid su "${member.guild.name}" (${member.guild.id}): ${state.count} join negli ultimi 30s. Ultimo: ${member.user.tag}. Nessuna azione automatica eseguita (no ban/kick).`
    );

    try {
      // Solo lettura config: mai scrivere getGuild/update qui oltre il get.
      const me = member.guild.members.me ?? (await member.guild.members.fetchMe().catch(() => null));
      if (me && !me.permissions.has(PermissionFlagsBits.ManageGuild)) return;

      const now = Date.now();
      // Evita crescita illimitata della mappa in memoria
      if (lastWarn.size > 500) {
        for (const [g, t] of lastWarn) if (now - t > WARN_COOLDOWN_MS) lastWarn.delete(g);
      }
      if (now - (lastWarn.get(member.guild.id) || 0) < WARN_COOLDOWN_MS) return;

      const cfg = getGuild(member.guild.id);
      if (!cfg.logChannelId) return;
      const ch = await member.guild.channels.fetch(cfg.logChannelId).catch(() => null);
      if (!ch?.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🚨 Possibile raid in corso')
        .setDescription(
          `**${state.count} nuovi membri** negli ultimi 30 secondi.\n` +
            'Nessuna azione automatica eseguita: valuta `/lockdown on` o lo slowmode.'
        )
        .addFields({ name: 'Ultimo arrivato', value: `${member} (\`${member.user.tag}\`)`, inline: false })
        .setTimestamp();

      await ch.send({ embeds: [embed] }).catch(() => null);
      lastWarn.set(member.guild.id, now);
    } catch (e) {
      console.error('antiRaid:', e.message);
    }
  },
};
