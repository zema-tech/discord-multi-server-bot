const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// theme.js condiviso (blu fun, footer). Fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { blue: 0x3498db };
const applyFooter = T?.applyFooter ?? ((embed, interaction) => {
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}` });
  } catch { /* footer non critico */ }
  try {
    embed.setTimestamp();
  } catch { /* ignora */ }
  return embed;
});

const TIMEOUT_MS = 10_000;
const FALLBACK = '😿 Le API degli animali non rispondono... **riprova più tardi**!';

// Fetch JSON con timeout: AbortController + try/catch, fallback se l'API è down.
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function urlValida(url) {
  // FIX: la vecchia regex /^https?:\/\/.+/ accettava spazi/"undefined" finale.
  // Discord rifiuta l'embed e l'editReply falliva. Ora: niente whitespace, max 2048.
  return typeof url === 'string' && url.length <= 2048 && /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url);
}

async function immagineGatto() {
  // GET https://cataas.com/cat?json=true -> { url: "/cat/xxxx" }
  const data = await fetchJson('https://cataas.com/cat?json=true');
  // FIX: `data.url` non era mai verificato: con JSON inatteso si costruiva
  // "https://cataas.comundefined" che passava la vecchia regex.
  const path = data && typeof data === 'object' ? data.url : null;
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('URL gatto non valida');
  const url = `https://cataas.com${path}`;
  if (!urlValida(url)) throw new Error('URL gatto non valida');
  return url;
}

async function immagineCane() {
  // GET https://dog.ceo/api/breeds/image/random -> { message: "<url>", status: "success" }
  const data = await fetchJson('https://dog.ceo/api/breeds/image/random');
  // FIX: guard contro JSON nullo/non-oggetto (prima: TypeError su data.status).
  if (!data || typeof data !== 'object') throw new Error('URL cane non valida');
  if (data.status !== 'success' || !urlValida(data.message)) throw new Error('URL cane non valida');
  return data.message;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('animale')
    .setDescription('Foto casuale di un gatto o di un cane! 🐾')
    .addStringOption((option) =>
      option
        .setName('tipo')
        .setDescription('Che animale vuoi vedere?')
        .setRequired(true)
        .addChoices(
          { name: '🐱 Gatto', value: 'gatto' },
          { name: '🐶 Cane', value: 'cane' }
        )
    ),
  cooldown: 5,
  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    await interaction.deferReply();
    try {
      const url = tipo === 'cane' ? await immagineCane() : await immagineGatto();
      const embed = new EmbedBuilder()
        .setColor(COLORS.blue)
        .setTitle(tipo === 'cane' ? '🐶 Ecco un cane!' : '🐱 Ecco un gatto!')
        .setImage(url);
      applyFooter(embed, interaction);
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({ content: FALLBACK }).catch(() => {});
    }
  },
};
