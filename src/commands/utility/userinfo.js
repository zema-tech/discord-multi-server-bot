const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informazioni su un utente')
    .addUserOption(option =>
      option.setName('utente')
        .setDescription('L\'utente di cui vuoi vedere le info')
        .setRequired(false)
    ),
  cooldown: 5,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor || 0x5865F2)
      .setTitle(`Info di ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Tag', value: user.tag, inline: true },
        { name: 'Bot?', value: user.bot ? 'Sì' : 'No', inline: true },
        { name: 'Account creato', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        {
          name: 'Entrato nel server',
          value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A',
          inline: true,
        },
        {
          name: 'Ruoli',
          value: member
            ? member.roles.cache
                .filter(r => r.id !== interaction.guild.id)
                .map(r => r.toString())
                .join(', ') || 'Nessuno'
            : 'N/A',
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
