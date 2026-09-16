const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, updateUser } = require('../../database/economy');

const DAILY_AMOUNT = 200;
const COOLDOWN = 24 * 60 * 60 * 1000; // 24 ore

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Ritira la tua ricompensa giornaliera'),
  cooldown: 5,
  async execute(interaction) {
    const userData = getUser(interaction.guild.id, interaction.user.id);
    const now = Date.now();

    if (now - userData.lastDaily < COOLDOWN) {
      const remaining = userData.lastDaily + COOLDOWN;
      return interaction.reply({
        content: `⏳ Puoi ritirare di nuovo <t:${Math.floor(remaining / 1000)}:R>`,
        ephemeral: true,
      });
    }

    const newBalance = userData.balance + DAILY_AMOUNT;
    updateUser(interaction.guild.id, interaction.user.id, {
      balance: newBalance,
      lastDaily: now,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎁 Ricompensa Giornaliera')
      .setDescription(`Hai ricevuto **${DAILY_AMOUNT}** monete!\nNuovo saldo: **${newBalance.toLocaleString('it-IT')}**`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
