const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, updateUser } = require('../../database/economy');

const jobs = [
  { name: 'Programmatore', emoji: '💻', min: 50, max: 150 },
  { name: 'Pizzaiolo', emoji: '🍕', min: 30, max: 100 },
  { name: 'Streamer', emoji: '🎥', min: 40, max: 180 },
  { name: 'Corriere', emoji: '📦', min: 25, max: 80 },
  { name: 'Insegnante', emoji: '📚', min: 45, max: 120 },
  { name: 'Meccanico', emoji: '🔧', min: 35, max: 110 },
];

const COOLDOWN = 60 * 60 * 1000; // 1 ora

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Lavora per guadagnare monete'),
  cooldown: 5,
  async execute(interaction) {
    const userData = getUser(interaction.guild.id, interaction.user.id);
    const now = Date.now();

    if (now - (Number(userData.lastWork) || 0) < COOLDOWN) {
      const remaining = (Number(userData.lastWork) || 0) + COOLDOWN;
      return interaction.reply({
        content: `⏳ Puoi lavorare di nuovo <t:${Math.floor(remaining / 1000)}:R> (<t:${Math.floor(remaining / 1000)}:T>)`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const earned = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
    // Base sanificata: con saldo corrotto (NaN) il nuovo saldo diventerebbe NaN.
    const base = Number.isFinite(userData.balance) ? userData.balance : 0;
    const newBalance = base + earned;

    updateUser(interaction.guild.id, interaction.user.id, {
      balance: newBalance,
      lastWork: now,
    });

    const fmt = (n) => n.toLocaleString('it-IT');
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('💼 Lavoro completato!')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(
        `${job.emoji} Hai lavorato come **${job.name}** e hai guadagnato **${fmt(earned)}** 🪙!\n👛 Nuovo saldo: **${fmt(newBalance)}** 🪙`
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
