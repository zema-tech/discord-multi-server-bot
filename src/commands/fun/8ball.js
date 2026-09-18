const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// theme.js condiviso (blu fun, slice sicuri). Fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { blue: 0x3498db };
const truncate = T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
// Le risposte sono in src/locales/{it,en}.js -> eightball.answers (20 voci).
function pickAnswers(lang) {
  const arr = t('eightball.answers', lang);
  if (Array.isArray(arr) && arr.length) return arr;
  const fb = t('eightball.answers', 'it');
  return Array.isArray(fb) && fb.length ? fb : ['…'];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Chiedi qualcosa alla palla magica 8')
    .addStringOption(option =>
      option.setName('domanda')
        .setDescription('La tua domanda')
        .setRequired(true)
    ),
  cooldown: 3,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const domanda = interaction.options.getString('domanda');
    const risposte = pickAnswers(lang);
    const risposta = risposte[Math.floor(Math.random() * risposte.length)];

    // FIX: domanda di soli spazi passava il vecchio `|| fallback` (truthy) e
    // produceva un field quasi-vuoto. Trim + fallback esplicito.
    const q = typeof domanda === 'string' ? domanda.trim() : '';
    const qVal = q ? truncate(q, 1024) : t('eightball.noQuestion', lang);

    const embed = new EmbedBuilder()
      .setColor(COLORS.blue)
      .setTitle(truncate(t('eightball.title', lang), 256))
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: truncate(t('eightball.question', lang), 256), value: qVal },
        // FIX: anche la risposta è troncata a 1024 (limite field Discord).
        { name: truncate(t('eightball.answer', lang), 256), value: truncate(t('eightball.answerValue', lang, { answer: risposta }), 1024) }
      )
      // Footer i18n (equivale a applyFooter, ma preserva EN).
      .setFooter({ text: truncate(t('common.requestedBy', lang, { tag: interaction.user.tag }), 2048) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
