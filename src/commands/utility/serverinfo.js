const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra informazioni sul server'),
  cooldown: 5,
  async execute(interaction) {
    const { guild } = interaction;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Info di ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'ID', value: guild.id, inline: true },
        { name: 'Proprietario', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Creato', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Membri', value: `${guild.memberCount}`, inline: true },
        { name: 'Canali', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Ruoli', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Boost Level', value: `${guild.premiumTier}`, inline: true },
        { name: 'Boost Count', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
        { name: 'Verifica', value: guild.verificationLevel.toString(), inline: true }
      )
      .setTimestamp();

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 }));
    }

    await interaction.reply({ embeds: [embed] });
  },
};
