const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Vedi il tuo saldo o quello di un altro utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const data = getUser(interaction.guild.id, user.id);
    const total = (data.balance || 0) + (data.bank || 0);
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`💰 Saldo di ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '👛 Portafoglio', value: `**${data.balance}** 🪙`, inline: true },
        { name: '🏦 Banca', value: `**${data.bank || 0}** 🪙`, inline: true },
        { name: '💎 Totale', value: `**${total}** 🪙`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
