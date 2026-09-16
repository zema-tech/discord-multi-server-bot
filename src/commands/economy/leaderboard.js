const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Classifica dei più ricchi del server'),
  cooldown: 5,
  async execute(interaction) {
    const top = getLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('📭 Nessun dato economico ancora. Usa `/daily` o `/work`!');
    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(
      top.map(async (e, i) => {
        const user = await interaction.client.users.fetch(e.id).catch(() => null);
        const name = user ? user.tag : 'Utente ' + e.id;
        const pos = medals[i] || ('**' + (i + 1) + '.**');
        return pos + ' ' + name + ' — **' + e.balance.toLocaleString('it-IT') + '** 🪙';
      })
    );
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`🏆 Classifica — ${interaction.guild.name}`)
      .setDescription(lines.join('\n'))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
