const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra la lista di tutti i comandi disponibili'),
  cooldown: 5,
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📚 Lista Comandi')
      .setDescription('Ecco tutti i comandi disponibili del bot:')
      .addFields(
        {
          name: '🛡️ Moderazione',
          value: '`/ban` `/kick` `/timeout` `/warn` `/warnings` `/clear`',
        },
        {
          name: '🎮 Divertimento',
          value: '`/meme` `/8ball` `/joke` `/coinflip` `/rps`',
        },
        {
          name: '💰 Economia',
          value: '`/balance` `/daily` `/work` `/pay` `/leaderboard`',
        },
        {
          name: '🔧 Utility',
          value: '`/ping` `/userinfo` `/serverinfo` `/avatar` `/help`',
        }
      )
      .setFooter({ text: 'Bot multi-server • Usa /comando per più dettagli' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
