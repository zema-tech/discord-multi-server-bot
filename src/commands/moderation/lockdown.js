const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const PFB = PermissionFlagsBits;
const { getLockdown, setLockdown, clearLockdown } = require('../../database/lockdown');

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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const everyoneId = guild.roles.everyone.id;
    const channels = guild.channels.cache.filter((c) => typeof c.isTextBased === 'function' && c.isTextBased() && (typeof c.isThread !== 'function' || !c.isThread()));

    if (sub === 'on') {
      const motivo = interaction.options.getString('motivo') || 'Nessun motivo specificato';
      if (channels.size === 0) {
        return interaction.reply({ content: '❌ Nessun canale testuale trovato.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();

      // 1. Snapshot degli overwrites correnti di @everyone/SendMessages
      const snapshot = {};
      for (const [id, ch] of channels) snapshot[id] = everyoneState(ch, everyoneId);
      setLockdown(guild.id, {
        motivo,
        by: interaction.user.id,
        byTag: interaction.user.tag,
        at: new Date().toISOString(),
        channels: snapshot,
      });

      // 2. Blocco, un canale alla volta (errori isolati per canale)
      let ok = 0;
      const failed = [];
      for (const [, ch] of channels) {
        try {
          await ch.permissionOverwrites.edit(everyoneId, { SendMessages: false });
          ok++;
        } catch {
          failed.push(ch.name);
        }
      }

      let msg = `🔒 **Lockdown attivato**: bloccati **${ok}/${channels.size}** canali.\n📝 Motivo: ${motivo}`;
      if (failed.length > 0) msg += `\n⚠️ Non bloccati (${failed.length}): ${failed.slice(0, 10).join(', ')}`;
      msg += '\nPer ripristinare: `/lockdown off`.';
      return interaction.editReply(msg);
    }

    // sub === 'off'
    const snap = getLockdown(guild.id);
    if (!snap) {
      return interaction.reply({ content: '❌ Nessun lockdown attivo su questo server.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();

    let ok = 0;
    const total = Object.keys(snap.channels).length;
    const failed = [];
    for (const [channelId, prev] of Object.entries(snap.channels)) {
      const ch = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
      if (!ch) continue;
      try {
        const value = prev === 'allow' ? true : prev === 'deny' ? false : null;
        await ch.permissionOverwrites.edit(everyoneId, { SendMessages: value });
        ok++;
      } catch {
        failed.push(ch.name ?? channelId);
      }
    }
    clearLockdown(guild.id);

    let msg = `🔓 **Lockdown terminato**: ripristinati **${ok}/${total}** canali.`;
    if (failed.length > 0) msg += `\n⚠️ Non ripristinati (${failed.length}): ${failed.slice(0, 10).join(', ')}`;
    return interaction.editReply(msg);
  },
};
