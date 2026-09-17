const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra la lista di tutti i comandi disponibili'),
  cooldown: 5,
  async execute(interaction, client) {
    const lang = getLang(interaction.guildId);
    const byFolder = {};
    for (const [, cmd] of client.commands) {
      const file = cmd.category || 'altri';
      if (!byFolder[file]) byFolder[file] = [];
      byFolder[file].push(`\`/${cmd.data.name}\``);
    }
    const titles = {
      moderation: t('help.categories.moderation', lang), fun: t('help.categories.fun', lang),
      economy: t('help.categories.economy', lang), utility: t('help.categories.utility', lang),
      levels: t('help.categories.levels', lang), tickets: t('help.categories.tickets', lang),
      ai: t('help.categories.ai', lang), music: t('help.categories.music', lang),
      altri: t('help.categories.altri', lang),
    };
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t('help.title', lang, { name: interaction.client.user.username }))
      .setDescription(t('help.description', lang, { count: client.commands.size, servers: interaction.client.guilds.cache.size }));
    for (const [cat, list] of Object.entries(byFolder)) {
      const sorted = list.sort();
      const label = `${titles[cat] || t('help.unknownCategory', lang, { cat })} (${sorted.length})`;
      embed.addFields({ name: label, value: sorted.join(' ').slice(0, 1024) || t('help.emptyField', lang) });
    }
    const baseUrl = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
    const footerText = baseUrl
      ? t('help.footerWith', lang, { baseUrl })
      : t('help.footerDefault', lang);
    embed.setFooter({ text: footerText.slice(0, 200) }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
