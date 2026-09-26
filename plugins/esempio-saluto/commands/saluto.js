const { SlashCommandBuilder } = require('discord.js');

const SALUTI = [
  'Ciao {user}! 👋',
  'Ehilà {user}, bentornato! 🎉',
  'Buongiorno {user}! ☀️',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('saluto')
    .setDescription('Un saluto casuale dal plugin di esempio'),
  cooldown: 3,
  async execute(interaction) {
    const testo = SALUTI[Math.floor(Math.random() * SALUTI.length)]
      .replace('{user}', interaction.user.username);
    await interaction.reply(testo).catch(() => null);
  },
};
