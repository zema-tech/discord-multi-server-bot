const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// theme.js condiviso (blu fun, footer, slice). Fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { blue: 0x3498db };
const truncate = T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));
const applyFooter = T?.applyFooter ?? ((embed, interaction) => {
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}` });
  } catch { /* footer non critico */ }
  try {
    embed.setTimestamp();
  } catch { /* ignora */ }
  return embed;
});

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
      .setColor(COLORS.blue)
      .setTitle('🪙 Lancio della moneta')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '⚔️ Sfida', value: truncate('🪙 Testa  **VS**  🟡 Croce', 1024), inline: false },
        { name: '🏆 Risultato', value: truncate(`${vincente} È uscito **${risultato}**!`, 1024), inline: false },
        { name: 'Sconfitto', value: truncate(`${perdente} ${altra}`, 1024), inline: false }
      );
    applyFooter(embed, interaction);

    await interaction.reply({ embeds: [embed] });
  },
};
