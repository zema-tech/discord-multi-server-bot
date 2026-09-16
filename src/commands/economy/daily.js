const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, updateUser } = require('../../database/economy');

const DAILY_AMOUNT = 500;
const COOLDOWN = 24 * 3600 * 1000;

module.exports = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Ritira la ricompensa giornaliera (500 🪙)'),
  cooldown: 5,
  async execute(interaction) {
    const data = getUser(interaction.guild.id, interaction.user.id);
    const now = Date.now();
    if (now - data.lastDaily < COOLDOWN) {
      return interaction.reply({
        content: `⏳ Prossimo daily <t:${Math.floor((data.lastDaily + COOLDOWN) / 1000)}:R>`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const streak = (data.dailyStreak || 0) + 1;
    const bonus = Math.min((streak - 1) * 50, 500);
    const reward = DAILY_AMOUNT + bonus;
    updateUser(interaction.guild.id, interaction.user.id, {
      balance: data.balance + reward,
      lastDaily: now,
      dailyStreak: streak,
    });
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🎁 Ricompensa giornaliera!')
      .setDescription(`Hai ricevuto **${reward}** 🪙!\n🔥 Streak: **${streak}** giorni (+${bonus} bonus)`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
