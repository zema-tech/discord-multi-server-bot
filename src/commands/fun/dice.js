const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const FACCE_DADO = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Lancia uno o più dadi')
    .addIntegerOption((o) => o.setName('facce').setDescription('Facce del dado (default 6)').setMinValue(2).setMaxValue(100).setRequired(false))
    .addIntegerOption((o) => o.setName('quantita').setDescription('Quanti dadi (default 1, max 10)').setMinValue(1).setMaxValue(10).setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const faces = interaction.options.getInteger('facce') ?? 6;
    const qty = interaction.options.getInteger('quantita') ?? 1;
    const rolls = Array.from({ length: qty }, () => 1 + Math.floor(Math.random() * faces));
    const total = rolls.reduce((a, b) => a + b, 0);
    const best = Math.max(...rolls);
    const mostra = faces === 6 ? rolls.map((r) => FACCE_DADO[r - 1]).join(' ') : `🎲 ${rolls.join(' • ')}`;
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`🎲 Lancio di ${qty}d${faces}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(`**${mostra}**`)
      .addFields(
        { name: '🎯 Risultati', value: `**${rolls.join(', ')}**`, inline: true },
        { name: '🏆 Totale', value: `**${total.toLocaleString('it-IT')}**`, inline: true },
        { name: '⭐ Migliore', value: `**${best}**`, inline: true }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
