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

// theme.js condiviso (fallback inline se il require fallisse).
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  const { EmbedBuilder: EB } = require('discord.js');
  theme = {
    COLORS: { primary: 0x5865f2, error: 0xed4245 },
    err: (t) => new EB().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EB().setColor(c ?? 0x5865f2).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); const n = Math.floor(Number(m)); if (!Number.isFinite(n) || n < 0) return str; return str.length <= n ? str : str.slice(0, n); },
  };
}
const { COLORS, err, info, applyFooter, truncate } = theme;

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
          embeds: [applyFooter(err('Ti serve il permesso **Gestisci Messaggi** per usare questo comando.'), interaction)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = interaction.options.getChannel('canale') || interaction.channel;
      if (!target?.isTextBased?.()) {
        return interaction.reply({ embeds: [applyFooter(err('Canale non valido.'), interaction)], flags: MessageFlags.Ephemeral });
      }

      const sniped = getSnipe(interaction.guildId, target.id);
      const attachments = Array.isArray(sniped?.attachments) ? sniped.attachments.filter((u) => typeof u === 'string' && u) : [];
      const hasAttachments = attachments.length > 0;
      const content = typeof sniped?.content === 'string' ? sniped.content : '';
      // Snipe vuoto (assente/scaduto/solo stringa vuota e senza allegati): risposta ephemeral, mai crash.
      if (!sniped || (!content.trim() && !hasAttachments)) {
        return interaction.reply({
          embeds: [applyFooter(err('Niente da snipare: nessun messaggio cancellato di recente in questo canale.'), interaction)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const authorTag = typeof sniped.authorTag === 'string' && sniped.authorTag ? sniped.authorTag : 'Sconosciuto';
      const ts = Number(sniped.createdAt);
      const deleted = Number.isFinite(ts) && ts > 0 ? `<t:${Math.floor(ts / 1000)}:R>` : 'di recente';
      const channelName = truncate(String(target.name || 'canale'), 100);
      const embed = applyFooter(
        info(
          `🎯 Snipe — #${channelName}`.slice(0, 256),
          content.trim() ? `💬 *"${truncate(content, 3900)}"*` : '*(solo allegati 📎)*',
          hasAttachments ? 0xeb459e : COLORS.primary
        ),
        interaction
      )
        .addFields(
          { name: '👤 Autore', value: `\`${truncate(authorTag, 100)}\``, inline: true },
          { name: '🕒 Cancellato', value: deleted, inline: true }
        )
        .setFooter({ text: `#${channelName} • Contenuto eliminato`.slice(0, 200) });
      if (hasAttachments) {
        embed.addFields({
          name: `Allegati (${attachments.length})`,
          value: truncate(attachments.map((u) => `[allegato](${u})`).join('\n'), 1024),
        });
      }
      // Ephemeral: evita di riesporre pubblicamente un contenuto cancellato.
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('snipe:', e.message);
      let payload;
      try {
        payload = { embeds: [applyFooter(err('Errore durante lo snipe.'), interaction)], flags: MessageFlags.Ephemeral };
      } catch {
        payload = { content: '❌ Errore durante lo snipe.', flags: MessageFlags.Ephemeral };
      }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
