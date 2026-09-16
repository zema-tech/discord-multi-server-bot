const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🎲 Lancio di ${qty}d${faces}`)
      .setDescription(`Risultati: **${rolls.join(', ')}**\nTotale: **${total}**`)
      .setFooter({ text: `Lanciato da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
