const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const PFB = PermissionFlagsBits;
const { getLockdown, setLockdown, clearLockdown } = require('../../database/lockdown');

// theme.js condiviso, con fallback inline se il require fallisse (mai nomi/opzioni diversi).
let COLORS, err, info, applyFooter, truncate;
try {
  ({ COLORS, err, info, applyFooter, truncate } = require('../../utils/theme'));
} catch {
  COLORS = { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
  const { EmbedBuilder } = require('discord.js');
  err = (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp();
  info = (t, d, c = 0x5865f2) => new EmbedBuilder().setColor(c ?? 0x5865f2).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp();
  applyFooter = (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; };
  truncate = (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); const n = Math.floor(Number(m)); if (!Number.isFinite(n) || n < 0) return str; return str.length <= n ? str : str.slice(0, n); };
}

function everyoneState(channel, everyoneId) {
  const ow = channel.permissionOverwrites.cache.get(everyoneId);
  if (!ow) return 'neutral';
  if (ow.allow.has(PFB.SendMessages)) return 'allow';
  if (ow.deny.has(PFB.SendMessages)) return 'deny';
  return 'neutral';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Blocca/sblocca TUTTI i canali testuali (emergenza raid)')
    .addSubcommand((s) =>
      s
        .setName('on')
        .setDescription('Blocca tutti i canali testuali (@everyone non può scrivere)')
        .addStringOption((o) => o.setName('motivo').setDescription('Motivo del lockdown').setRequired(false))
    )
    .addSubcommand((s) => s.setName('off').setDescription('Ripristina i permessi precedenti al lockdown'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;
    if (!guild) {
      return interaction.reply({ embeds: [err('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const everyoneId = guild.roles.everyone.id;
    const channels = guild.channels.cache.filter((c) => typeof c.isTextBased === 'function' && c.isTextBased() && (typeof c.isThread !== 'function' || !c.isThread()));

    if (sub === 'on') {
      const motivo = truncate(interaction.options.getString('motivo') || 'Nessun motivo specificato', 500);
      if (getLockdown(guild.id)) {
        return interaction.reply({ embeds: [err('Lockdown già attivo su questo server. Usa `/lockdown off` per ripristinare prima.')], flags: MessageFlags.Ephemeral });
      }
      if (channels.size === 0) {
        return interaction.reply({ embeds: [err('Nessun canale testuale trovato.')], flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply().catch(() => null);
      if (!interaction.deferred && !interaction.replied) {
        return;
      }

      // 1. Snapshot degli overwrites correnti di @everyone/SendMessages
      const snapshot = {};
      for (const [id, ch] of channels) snapshot[id] = everyoneState(ch, everyoneId);
      setLockdown(guild.id, {
        motivo,
        by: interaction.user.id,
        byTag: interaction.user.tag ?? interaction.user.username,
        at: new Date().toISOString(),
        channels: snapshot,
      });

      // 2. Blocco, un canale alla volta (errori isolati per canale)
      let okCount = 0;
      const failed = [];
      for (const [, ch] of channels) {
        try {
          if (typeof ch?.permissionOverwrites?.edit !== 'function') throw new Error('no-overwrites');
          await ch.permissionOverwrites.edit(everyoneId, { SendMessages: false });
          okCount++;
        } catch {
          failed.push(ch?.name ?? ch?.id ?? '?');
        }
      }

      let desc = `Bloccati **${okCount}/${channels.size}** canali.\n📝 Motivo: ${motivo}`;
      if (failed.length > 0) desc += `\n⚠️ Non bloccati (${failed.length}): ${truncate(failed.slice(0, 10).join(', '), 500)}`;
      desc += '\nPer ripristinare: `/lockdown off`.';
      const embed = applyFooter(info('🔒 Lockdown attivato', truncate(desc, 4000)), interaction);
      return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }

    // sub === 'off'
    const snap = getLockdown(guild.id);
    if (!snap) {
      return interaction.reply({ embeds: [err('Nessun lockdown attivo su questo server.')], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply().catch(() => null);
    if (!interaction.deferred && !interaction.replied) {
      return;
    }

    let okCount = 0;
    const total = snap.channels && typeof snap.channels === 'object' ? Object.keys(snap.channels).length : 0;
    const failed = [];
    const missing = [];
    for (const [channelId, prev] of Object.entries(snap.channels || {})) {
      const ch = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
      if (!ch) {
        missing.push(channelId);
        continue;
      }
      try {
        if (typeof ch?.permissionOverwrites?.edit !== 'function') throw new Error('no-overwrites');
        if (prev === 'neutral') {
          // Lo snapshot "neutral" include i canali che NON avevano overwrite:
          // delete ripristina davvero lo stato precedente (edit con null lascerebbe un overwrite vuoto).
          try {
            await ch.permissionOverwrites.delete(everyoneId);
          } catch {
            await ch.permissionOverwrites.edit(everyoneId, { SendMessages: null });
          }
        } else {
          const value = prev === 'allow';
          await ch.permissionOverwrites.edit(everyoneId, { SendMessages: value });
        }
        okCount++;
      } catch {
        failed.push(ch?.name ?? channelId);
      }
    }
    clearLockdown(guild.id);

    let desc = `Ripristinati **${okCount}/${total}** canali.`;
    if (failed.length > 0) desc += `\n⚠️ Non ripristinati (${failed.length}): ${truncate(failed.slice(0, 10).join(', '), 500)}`;
    if (missing.length > 0) desc += `\nℹ️ Canali eliminati durante il lockdown (${missing.length}): non ripristinabili.`;
    const offEmbed = applyFooter(info('🔓 Lockdown terminato', truncate(desc, 4000), COLORS.success), interaction);
    return interaction.editReply({ embeds: [offEmbed] }).catch(() => {});
  },
};
