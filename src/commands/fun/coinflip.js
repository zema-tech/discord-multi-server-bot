const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Lancia una moneta (testa o croce)'),
  cooldown: 2,
  async execute(interaction) {
    const risultato = Math.random() < 0.5 ? 'Testa' : 'Croce';
    const emoji = risultato === 'Testa' ? '🪙' : '🟡';

    await interaction.reply(`${emoji} È uscito **${risultato}**!`);
  },
};
