const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { parseChannelId, getFeeds, addFeed, removeFeed, MAX_FEEDS } = require('../../database/youtube');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, error: 0xed4245 };
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Notifiche nuovi video YouTube (gratis, via RSS)')
    .addSubcommand((s) =>
      s.setName('aggiungi').setDescription('Avvisa i nuovi video di un canale (staff)')
        .addStringOption((o) => o.setName('canale').setDescription('ID UC… o URL /channel/').setRequired(true).setMaxLength(120))
        .addChannelOption((o) => o.setName('annunci').setDescription('Dove annunciare').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Stop notifiche (staff)')
        .addStringOption((o) => o.setName('canale').setDescription('ID o URL').setRequired(true).setMaxLength(120))
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Canali monitorati'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'lista') {
      const feeds = getFeeds(gid);
      if (!feeds.length) {
        return interaction.reply({ content: '📺 Nessun canale monitorato. Usa `/youtube aggiungi`.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📺 YouTube monitorati (${feeds.length}/${MAX_FEEDS})`)
        .setDescription(truncate(feeds.map((f) => `• \`${f.channelId}\` → <#${f.announceId}>`).join('\n'), 4000))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'aggiungi') {
      const raw = interaction.options.getString('canale', true);
      const ch = interaction.options.getChannel('annunci', true);
      const id = parseChannelId(raw);
      if (!id) {
        return interaction.reply({ embeds: [themeErr('Canale non valido: incolla ID (UC…) o URL youtube.com/channel/UC…')], flags: MessageFlags.Ephemeral });
      }
      try {
        const r = addFeed(gid, id, ch.id);
        return interaction.reply({
          content: r.dup ? `ℹ️ \`${id}\` già monitorato.` : `✅ Monitoro \`${id}\`: nuovi video in ${ch} (controllo ogni 15 min).`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Operazione fallita.')], flags: MessageFlags.Ephemeral });
      }
    }
    const ok = removeFeed(gid, interaction.options.getString('canale', true));
    return interaction.reply({ content: ok ? '✅ Monitoraggio rimosso.' : '❌ Canale non monitorato.', flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
