const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, updateUser } = require('../../database/economy');

const jobs = [
  { name: 'Programmatore', min: 50, max: 150 },
  { name: 'Pizzaiolo', min: 30, max: 100 },
  { name: 'Streamer', min: 40, max: 180 },
  { name: 'Corriere', min: 25, max: 80 },
  { name: 'Insegnante', min: 45, max: 120 },
  { name: 'Meccanico', min: 35, max: 110 },
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
        content: `⏳ Puoi lavorare di nuovo <t:${Math.floor(remaining / 1000)}:R>`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const earned = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
    const newBalance = userData.balance + earned;

    updateUser(interaction.guild.id, interaction.user.id, {
      balance: newBalance,
      lastWork: now,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('💼 Lavoro completato!')
      .setDescription(`Hai lavorato come **${job.name}** e hai guadagnato **${earned}** monete!\nNuovo saldo: **${newBalance.toLocaleString('it-IT')}**`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
