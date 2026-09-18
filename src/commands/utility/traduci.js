const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  const { EmbedBuilder: EB } = require('discord.js');
  theme = {
    COLORS: { success: 0x57f287, error: 0xed4245, primary: 0x5865f2 },
    err: (t) => new EB().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t).slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EB().setColor(c).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}

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
        embeds: [theme.err(`Lingua di origine non supportata: \`${theme.truncate(daRaw, 20)}\`. Usa una tra: ${SOURCE_LANGS.join(', ')}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!a) {
      await interaction.reply({
        embeds: [theme.err(`Lingua di destinazione non supportata: \`${theme.truncate(aRaw, 20)}\`. Usa una tra: ${LANGS.join(', ')}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // FIX validazione: stessa lingua origine/destinazione (es. it→it) = richiesta inutile;
    // prima veniva chiamata l'API e sprecata quota gratuita.
    if (da !== 'auto' && da === a) {
      await interaction.reply({
        embeds: [theme.err(`Origine e destinazione coincidono (\`${a}\`): scegli due lingue diverse.`)],
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
      // FIX: prima il controllo quota era `!translated || (status!==200 && !translated)` = solo !translated;
      // ora intercetta anche status non-200 e risposte di errore testuali (quota/limite lunghezza).
      const status = Number(json?.responseStatus);
      const errText = String(translated ?? '');
      if (!translated || (Number.isFinite(status) && status !== 200) || /QUERY LENGTH LIMIT|RATE LIMIT|INVALID/i.test(errText)) {
        throw new Error(`MyMemory status ${json?.responseStatus || 'sconosciuto'}`);
      }
    } catch {
      await interaction.editReply(
        '❌ Traduzione non disponibile al momento (il piano gratuito MyMemory ha limiti giornalieri). Riprova più tardi.',
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(theme.COLORS.success ?? 0x57f287)
      .setTitle(`🌍 Traduzione ${da} → ${a}`)
      .addFields(
        { name: '📝 Originale', value: testo.slice(0, 1000), inline: false },
        { name: '✅ Traduzione', value: String(translated).slice(0, 1000), inline: false },
      )
      .setFooter({ text: 'MyMemory gratis: max 500 caratteri/richiesta, ~5000 caratteri/giorno senza chiave.'.slice(0, 200) })
      .setTimestamp();
    theme.applyFooter(embed, interaction);
    try { embed.setFooter({ text: `MyMemory • Richiesto da ${interaction.user.tag}`.slice(0, 200) }); } catch {}

    await interaction.editReply({ embeds: [embed] });
  },
};
