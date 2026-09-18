const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

let _theme = null;
try {
  _theme = require('../../utils/theme');
} catch {
  _theme = null;
}
const BLUE = _theme?.COLORS?.blue ?? 0x3498db;
const applyFooter = _theme?.applyFooter ?? ((e, i) => {
  try {
    e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` });
    e.setTimestamp();
  } catch { /* ignora */ }
  return e;
});
const truncate = _theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));
const num = _theme?.num ?? ((n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('it-IT') : 'n/d'; });

const FACCE_DADO = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Lancia uno o più dadi')
    .addIntegerOption((o) => o.setName('facce').setDescription('Facce del dado (default 6)').setMinValue(2).setMaxValue(100).setRequired(false))
    .addIntegerOption((o) => o.setName('quantita').setDescription('Quanti dadi (default 1, max 10)').setMinValue(1).setMaxValue(10).setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    // Sanitizza: getInteger può dare null (default) o valori fuori range se invocato via API.
    let faces = interaction.options.getInteger('facce') ?? 6;
    let qty = interaction.options.getInteger('quantita') ?? 1;
    if (!Number.isInteger(faces) || faces < 2 || faces > 100) faces = 6;
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) qty = 1;
    const rolls = Array.from({ length: qty }, () => 1 + Math.floor(Math.random() * faces));
    const total = rolls.reduce((a, b) => a + b, 0);
    const best = Math.max(...rolls);
    const mostra = faces === 6 ? rolls.map((r) => FACCE_DADO[r - 1]).join(' ') : `🎲 ${rolls.join(' • ')}`;
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(truncate(`🎲 Lancio di ${qty}d${faces}`, 256))
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(truncate(`**${mostra}**`, 4000))
      .addFields(
        { name: '🎯 Risultati', value: truncate(`**${rolls.join(', ')}**`, 1024), inline: true },
        { name: '🏆 Totale', value: `**${num(total)}**`, inline: true },
        { name: '⭐ Migliore', value: `**${num(best)}**`, inline: true }
      );
    applyFooter(embed, interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
