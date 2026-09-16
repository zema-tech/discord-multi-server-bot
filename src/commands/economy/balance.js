const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Mostra il tuo saldo o quello di un altro utente')
    .addUserOption(option =>
      option.setName('utente')
        .setDescription('L\'utente di cui vuoi vedere il saldo')
        .setRequired(false)
    ),
  cooldown: 3,
  async execute(interaction) {
    const target = interaction.options.getUser('utente') || interaction.user;
    const userData = getUser(interaction.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`💰 Saldo di ${target.username}`)
      .setDescription(`**${userData.balance.toLocaleString('it-IT')}** monete`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
