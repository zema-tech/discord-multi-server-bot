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
    const wallet = Number.isFinite(data.balance) ? data.balance : 0;
    const bank = Number.isFinite(data.bank) ? data.bank : 0;
    const total = wallet + bank;
    const fmt = (n) => n.toLocaleString('it-IT');
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`💰 Saldo di ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '👛 Portafoglio', value: `**${fmt(wallet)}** 🪙`, inline: true },
        { name: '🏦 Banca', value: `**${fmt(bank)}** 🪙`, inline: true },
        { name: '💎 Totale', value: `**${fmt(total)}** 🪙`, inline: true }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
