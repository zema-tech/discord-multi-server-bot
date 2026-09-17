/**
 * /snipe [canale] — mostra l'ultimo messaggio cancellato del canale (dalla snipeCache, TTL 60s).
 * Richiede il permesso Gestisci Messaggi.
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getSnipe } = require('../../utils/snipeCache');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Mostra l’ultimo messaggio cancellato del canale')
    .addChannelOption((o) =>
      o
        .setName('canale')
        .setDescription('Canale da cui recuperare il messaggio (default: canale corrente)')
        .setRequired(false)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 3,
  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          content: '❌ Ti serve il permesso **Gestisci Messaggi** per usare questo comando.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = interaction.options.getChannel('canale') || interaction.channel;
      if (!target?.isTextBased?.()) {
        return interaction.reply({ content: '❌ Canale non valido.', flags: MessageFlags.Ephemeral });
      }

      const sniped = getSnipe(interaction.guildId, target.id);
      const hasAttachments = Array.isArray(sniped?.attachments) && sniped.attachments.length > 0;
      if (!sniped || (!sniped.content && !hasAttachments)) {
        return interaction.reply({
          content: '❌ Niente da snipare: nessun messaggio cancellato di recente in questo canale.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(hasAttachments ? 0xeb459e : 0x5865f2)
        .setTitle(`🎯 Snipe — #${target.name || 'canale'}`.slice(0, 256))
        .setDescription(sniped.content ? `💬 *"${String(sniped.content).slice(0, 3900)}"*` : '*(solo allegati 📎)*')
        .addFields(
          { name: '👤 Autore', value: `\`${sniped.authorTag}\``, inline: true },
          { name: '🕒 Cancellato', value: `<t:${Math.floor(sniped.createdAt / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: `#${target.name || 'canale'} • Contenuto eliminato`.slice(0, 200) })
        .setTimestamp();
      if (hasAttachments) {
        embed.addFields({
          name: `Allegati (${sniped.attachments.length})`,
          value: sniped.attachments.map((u) => `[allegato](${u})`).join('\n').slice(0, 1024),
        });
      }
      // Ephemeral: evita di riesporre pubblicamente un contenuto cancellato.
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('snipe:', e.message);
      const payload = { content: '❌ Errore durante lo snipe.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
