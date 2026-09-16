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
    const need = xpForLevel(d.level);
    const bar = '▓'.repeat(Math.round((d.xp / need) * 12)).padEnd(12, '░');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⭐ Rank di ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(`**Livello ${d.level}**\n\`${bar}\` ${d.xp}/${need} XP\n💬 Messaggi: **${d.messageCount}**`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
