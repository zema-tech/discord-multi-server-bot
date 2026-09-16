const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLevel, xpForLevel } = require('../../database/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Mostra il tuo livello (o quello di un altro utente)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const d = getLevel(interaction.guild.id, user.id);
    // Sanitizza: record corrotti (livello negativo) mandavano in crash String.repeat
    const level = Number.isFinite(d.level) ? Math.max(0, Math.floor(d.level)) : 0;
    const need = Math.max(1, xpForLevel(level));
    const xp = Number.isFinite(d.xp) ? Math.min(Math.max(0, d.xp), need) : 0;
    const msgCount = Number.isFinite(d.messageCount) ? Math.max(0, Math.floor(d.messageCount)) : 0;
    const bar = '▓'.repeat(Math.round((xp / need) * 12)).padEnd(12, '░');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⭐ Rank di ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(`**Livello ${level}**\n\`${bar}\` ${xp}/${need} XP\n💬 Messaggi: **${msgCount}**`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
