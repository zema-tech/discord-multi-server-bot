const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

function boostBar(count) {
  const max = 14;
  const filled = Math.max(0, Math.min(10, Math.round((Math.min(count, max) / max) * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informazioni sul server'),
  cooldown: 5,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const g = interaction.guild;
    if (!g) return interaction.reply({ content: t('common.guildOnly', lang), flags: MessageFlags.Ephemeral });
    const channels = g.channels.cache;
    const text = channels.filter((c) => c.isTextBased && c.isTextBased() && !c.isThread?.()).size;
    const voice = channels.filter((c) => c.type === 2).size;
    const cats = channels.filter((c) => c.type === 4).size;
    const threads = channels.filter((c) => c.isThread?.()).size;
    const emojiCount = g.emojis.cache.size;
    const stickerCount = g.stickers.cache.size;
    const boosts = g.premiumSubscriptionCount || 0;
    const ts = Math.floor(g.createdTimestamp / 1000);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏰 ${g.name}`)
      .setDescription(t('serverinfo.description', lang, { tier: g.premiumTier, bar: boostBar(boosts), boosts, ownerId: g.ownerId, id: g.id }));
    // Server senza icona: iconURL() è null e setThumbnail(null) lancia.
    const icon = g.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);
    const banner = g.bannerURL ? g.bannerURL({ size: 1024 }) : null;
    if (banner) embed.setImage(banner);
    embed.addFields(
        { name: t('serverinfo.fields.members', lang), value: t('serverinfo.values.members', lang, { count: g.memberCount }), inline: true },
        {
          name: t('serverinfo.fields.channels', lang),
          value: threads
            ? t('serverinfo.values.channelsThreads', lang, { text, voice, cats, threads })
            : t('serverinfo.values.channels', lang, { text, voice, cats }),
          inline: true,
        },
        { name: t('serverinfo.fields.roles', lang), value: t('serverinfo.values.roles', lang, { count: g.roles.cache.size }), inline: true },
        { name: t('serverinfo.fields.emoji', lang), value: t('serverinfo.values.emoji', lang, { emoji: emojiCount, stickers: stickerCount }), inline: true },
        { name: t('serverinfo.fields.boost', lang), value: t('serverinfo.values.boost', lang, { tier: g.premiumTier, boosts }), inline: true },
        { name: t('serverinfo.fields.created', lang), value: t('serverinfo.values.created', lang, { ts }), inline: true }
      )
      .setFooter({ text: t('serverinfo.footer', lang, { name: g.name, id: g.id }).slice(0, 200) })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
