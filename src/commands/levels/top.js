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
        const member = u ? await interaction.guild.members.fetch(e.id).catch(() => null) : null;
        const display = member ? member.displayName : u ? u.username : null;
        const name = display ? `**${display}**` : '*Utente uscito*';
        const pos = medals[i] || `**${i + 1}.**`;
        const lvl = Number.isFinite(e.level) ? Math.max(0, Math.floor(e.level)) : 0;
        const xp = Number.isFinite(e.xp) ? Math.max(0, Math.floor(e.xp)) : 0;
        return `${pos} ${name} — Liv. **${lvl.toLocaleString('it-IT')}** (${xp.toLocaleString('it-IT')} XP)`;
      })
    );
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`⭐ Top livelli — ${interaction.guild.name}`)
      .setThumbnail(interaction.guild.iconURL() || interaction.user.displayAvatarURL())
      .setDescription(lines.join('\n').slice(0, 4096))
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
