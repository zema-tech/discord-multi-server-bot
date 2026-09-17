const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Lancia una moneta (testa o croce)'),
  cooldown: 2,
  async execute(interaction) {
    const risultato = Math.random() < 0.5 ? 'Testa' : 'Croce';
    const vincente = risultato === 'Testa' ? '🪙' : '🟡';
    const perdente = risultato === 'Testa' ? '🟡' : '🪙';
    const altra = risultato === 'Testa' ? 'Croce' : 'Testa';

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🪙 Lancio della moneta')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '⚔️ Sfida', value: '🪙 Testa  **VS**  🟡 Croce', inline: false },
        { name: '🏆 Risultato', value: `${vincente} È uscito **${risultato}**!`, inline: false },
        { name: 'Sconfitto', value: `${perdente} ${altra}`, inline: false }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
