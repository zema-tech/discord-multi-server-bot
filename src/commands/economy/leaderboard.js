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
        const member = user ? await interaction.guild.members.fetch(e.id).catch(() => null) : null;
        const display = member ? member.displayName : user ? user.username : null;
        const name = display ? `**${display}**` : '*Utente uscito*';
        const pos = medals[i] || `**${i + 1}.**`;
        const bal = Number.isFinite(e.balance) ? e.balance : 0;
        return `${pos} ${name} — **${bal.toLocaleString('it-IT')}** 🪙`;
      })
    );
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`🏆 Classifica più ricchi — ${interaction.guild.name}`)
      .setThumbnail(interaction.guild.iconURL() || interaction.user.displayAvatarURL())
      .setDescription(lines.join('\n').slice(0, 4096))
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
