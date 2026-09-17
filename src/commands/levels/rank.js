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
    const xp = Number.isFinite(d.xp) ? Math.min(Math.max(0, Math.floor(d.xp)), need) : 0;
    const msgCount = Number.isFinite(d.messageCount) ? Math.max(0, Math.floor(d.messageCount)) : 0;
    const ratio = need > 0 ? xp / need : 0;
    const SIZE = 12;
    const filled = Math.min(SIZE, Math.max(0, Math.round(ratio * SIZE)));
    const bar = '█'.repeat(filled) + '░'.repeat(SIZE - filled);
    const percent = Math.round(ratio * 100);
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`⭐ Rank di ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(
        `**Livello ${level.toLocaleString('it-IT')}** • **${percent}%**\n\`${bar}\`\n✨ **${xp.toLocaleString('it-IT')}** / **${need.toLocaleString('it-IT')}** XP\n💬 Messaggi: **${msgCount.toLocaleString('it-IT')}**`
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
