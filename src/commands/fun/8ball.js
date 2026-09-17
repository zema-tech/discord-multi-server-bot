const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

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

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(t('eightball.title', lang))
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        // Limite field Discord 1024 char: domande lunghe crasherebbero l'invio.
        { name: t('eightball.question', lang), value: String(domanda || '').slice(0, 1024) || t('eightball.noQuestion', lang) },
        { name: t('eightball.answer', lang), value: t('eightball.answerValue', lang, { answer: risposta }) }
      )
      .setFooter({ text: t('common.requestedBy', lang, { tag: interaction.user.tag }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
