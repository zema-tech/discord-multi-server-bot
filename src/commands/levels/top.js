const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../../database/levels');

module.exports = {
  data: new SlashCommandBuilder().setName('top').setDescription('Classifica livelli del server'),
  cooldown: 5,
  async execute(interaction) {
    const top = getLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('📭 Nessun XP ancora. Scrivi in chat per salire di livello!');
    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(
      top.map(async (e, i) => {
        const u = await interaction.client.users.fetch(e.id).catch(() => null);
        const name = u ? u.tag : 'Utente ' + e.id;
        const pos = medals[i] || ('**' + (i + 1) + '.**');
        return pos + ' ' + name + ' — Liv. **' + e.level + '** (' + e.xp + ' XP)';
      })
    );
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`⭐ Top livelli — ${interaction.guild.name}`).setDescription(lines.join('\n')).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
