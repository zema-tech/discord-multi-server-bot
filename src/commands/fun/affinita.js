const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// theme.js condiviso (blu fun, barra progresso, slice). Fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { blue: 0x3498db };
const bar = T?.bar ?? ((cur, max, len = 10) => {
  const pieni = Math.max(0, Math.min(len, Math.round(Number(cur) / 10)));
  return '█'.repeat(pieni) + '░'.repeat(len - pieni);
});
const truncate = T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

function hashDeterministico(str) {
  // FNV-1a 32bit: stabile tra riavvii, niente dipendenze
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
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

    // FIX: utente mancante (es. opzione required aggirata / utente uscito dal
    // cache) causava TypeError su `.id`. Risposta ephemeral invece di crash.
    if (!utente1 || !utente2) {
      return interaction.reply({ content: '❌ Utente non valido: riseleziona gli utenti e riprova.', ephemeral: true });
    }

    // Ordina gli ID così il risultato è indipendente dall'ordine (stabile)
    const [a, b] = [utente1.id, utente2.id].sort();
    const percentuale = hashDeterministico(`${a}|${b}`) % 101;

    const embed = new EmbedBuilder()
      .setColor(COLORS.blue)
      .setTitle('💘 Affinità di coppia')
      .setThumbnail(utente1.displayAvatarURL())
      .setDescription(
        truncate(`**${utente1}**  ❤️ VS ❤️  **${utente2}**\n\n💯 **${percentuale}%**  \`${bar(percentuale, 100, 10)}\`\n\n_${commento(percentuale)}_`, 4096)
      )
      // Footer manuale (non applyFooter) per preservare il disclaimer esistente.
      .setFooter({ text: truncate(`Richiesto da ${interaction.user.tag} • Puro divertimento, non prendetelo sul serio!`, 2048) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
