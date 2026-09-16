const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informazioni su un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor || 0x5865f2)
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Sì' : 'No', inline: true },
        { name: 'Account creato', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
      );
    if (member) {
      embed.addFields(
        { name: 'Entrato nel server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Ruolo principale', value: `${member.roles.highest}`, inline: true },
        { name: `Ruoli (${member.roles.cache.size - 1})`, value: member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => `${r}`).join(' ').slice(0, 1024) || 'Nessuno' }
      );
    }
    embed.setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
