const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Mostra l'avatar di un utente")
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const user = interaction.options.getUser('utente') || interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t('avatar.title', lang, { tag: user.tag }).slice(0, 256))
      .setDescription(t('avatar.description', lang, {
        url,
        id: user.id,
        kind: user.bot ? t('avatar.kindBot', lang) : t('avatar.kindUser', lang),
      }))
      .setImage(url)
      .setFooter({ text: t('common.requestedBy', lang, { tag: interaction.user.tag }).slice(0, 200) })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
