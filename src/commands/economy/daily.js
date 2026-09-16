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
    const lastDaily = Number(data.lastDaily) || 0;
    if (now - lastDaily < COOLDOWN) {
      return interaction.reply({
        content: `⏳ Prossimo daily <t:${Math.floor((lastDaily + COOLDOWN) / 1000)}:R>`,
        flags: MessageFlags.Ephemeral,
      });
    }
    // Streak solo se l'ultimo daily è di ieri: se saltato (>48h), riparte da 1
    const streak = now - lastDaily <= 2 * COOLDOWN ? (Number(data.dailyStreak) || 0) + 1 : 1;
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
