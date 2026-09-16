const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informazioni sul server'),
  cooldown: 5,
  async execute(interaction) {
    const g = interaction.guild;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏰 ${g.name}`)
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: g.id, inline: true },
        { name: 'Proprietario', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Membri', value: `${g.memberCount}`, inline: true },
        { name: 'Canali', value: `${g.channels.cache.size}`, inline: true },
        { name: 'Ruoli', value: `${g.roles.cache.size}`, inline: true },
        { name: 'Boost', value: `Livello ${g.premiumTier} (${g.premiumSubscriptionCount || 0} boost)`, inline: true },
        { name: 'Creato', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
