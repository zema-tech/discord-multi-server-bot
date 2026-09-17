const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function hashDeterministico(str) {
  // FNV-1a 32bit: stabile tra riavvii, niente dipendenze
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function barra(percentuale) {
  const pieni = Math.round(percentuale / 10); // 0..10
  return '█'.repeat(pieni) + '░'.repeat(10 - pieni);
}

function commento(percentuale) {
  if (percentuale >= 95) return '💍 Anime gemelle! Il server vi dichiara ufficialmente inseparabili.';
  if (percentuale >= 85) return '🔥 Affinità alle stelle! Fate già paura al resto del server.';
  if (percentuale >= 70) return '😏 Alta tensione… qui scatta la ship ufficiale nei commenti.';
  if (percentuale >= 55) return '🙂 Buona intesa! Un caffè insieme e si vola.';
  if (percentuale >= 40) return '😐 Né carne né pesce: coinquilini funzionali, niente scintille.';
  if (percentuale >= 25) return '😬 Vi sopportate a malapena… come il lunedì mattina.';
  if (percentuale >= 10) return '🧊 Freddo polare! Meglio restare su server diversi.';
  return '💥 Disastro cosmico! Nemmeno il bot riesce a unirvi.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('affinita')
    .setDescription('Calcola l\'affinità (ironica) tra due utenti')
    .addUserOption((o) => o.setName('utente1').setDescription('Primo utente').setRequired(true))
    .addUserOption((o) => o.setName('utente2').setDescription('Secondo utente (default: tu)').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const utente1 = interaction.options.getUser('utente1');
    const utente2 = interaction.options.getUser('utente2') || interaction.user;

    // Ordina gli ID così il risultato è indipendente dall'ordine (stabile)
    const [a, b] = [utente1.id, utente2.id].sort();
    const percentuale = hashDeterministico(`${a}|${b}`) % 101;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('💘 Affinità di coppia')
      .setThumbnail(utente1.displayAvatarURL())
      .setDescription(`**${utente1}**  ❤️ VS ❤️  **${utente2}**\n\n💯 **${percentuale}%**  \`${barra(percentuale)}\`\n\n_${commento(percentuale)}_`)
      .setFooter({ text: `Richiesto da ${interaction.user.tag} • Puro divertimento, non prendetelo sul serio!` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
