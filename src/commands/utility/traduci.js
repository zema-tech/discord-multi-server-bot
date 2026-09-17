const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const API_URL = 'https://api.mymemory.translated.net/get';
const FETCH_TIMEOUT_MS = 10000;
const MAX_CHARS = 500;

// Whitelist lingue ISO supportate (~10 + auto per la sorgente)
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt', 'ru', 'ja', 'zh', 'ar'];
const SOURCE_LANGS = ['auto', ...LANGS];

function normalizeLang(value, allowed) {
  const v = String(value || '').trim().toLowerCase();
  if (allowed.includes(v)) return v;
  return null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  // Esportate per test: validazione input
  LANGS,
  SOURCE_LANGS,
  MAX_CHARS,
  normalizeLang,
  data: new SlashCommandBuilder()
    .setName('traduci')
    .setDescription('Traduci un testo (MyMemory, gratis, max 500 caratteri)')
    .addStringOption((o) =>
      o.setName('testo').setDescription('Testo da tradurre (max 500 caratteri)').setRequired(true).setMaxLength(MAX_CHARS),
    )
    .addStringOption((o) =>
      o.setName('da').setDescription('Lingua di origine (default: auto)').setRequired(false),
    )
    .addStringOption((o) => o.setName('a').setDescription('Lingua di destinazione (default: it)').setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const testo = interaction.options.getString('testo', true).trim();
    const daRaw = interaction.options.getString('da') || 'auto';
    const aRaw = interaction.options.getString('a') || 'it';

    if (!testo) {
      await interaction.reply({ content: '❌ Inserisci un testo da tradurre.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (testo.length > MAX_CHARS) {
      await interaction.reply({
        content: `❌ Testo troppo lungo (${testo.length}/${MAX_CHARS} caratteri). Accorcialo e riprova.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const da = normalizeLang(daRaw, SOURCE_LANGS);
    const a = normalizeLang(aRaw, LANGS);
    if (!da) {
      await interaction.reply({
        content: `❌ Lingua di origine non supportata: \`${daRaw}\`. Usa una tra: ${SOURCE_LANGS.join(', ')}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!a) {
      await interaction.reply({
        content: `❌ Lingua di destinazione non supportata: \`${aRaw}\`. Usa una tra: ${LANGS.join(', ')}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let translated;
    try {
      const url = `${API_URL}?q=${encodeURIComponent(testo)}&langpair=${encodeURIComponent(`${da}|${a}`)}`;
      const json = await fetchJson(url);
      translated = json && json.responseData && json.responseData.translatedText;
      // MyMemory segnala errori di quota nel campo responseStatus
      if (!translated || (json.responseStatus && Number(json.responseStatus) !== 200 && !translated)) {
        throw new Error(`MyMemory status ${json.responseStatus || 'sconosciuto'}`);
      }
    } catch {
      await interaction.editReply(
        '❌ Traduzione non disponibile al momento (il piano gratuito MyMemory ha limiti giornalieri). Riprova più tardi.',
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🌍 Traduzione ${da} → ${a}`)
      .addFields(
        { name: '📝 Originale', value: testo.slice(0, 1000), inline: false },
        { name: '✅ Traduzione', value: String(translated).slice(0, 1000), inline: false },
      )
      .setFooter({ text: 'MyMemory gratis: max 500 caratteri/richiesta, ~5000 caratteri/giorno senza chiave.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
