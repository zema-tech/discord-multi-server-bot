const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
  return typeof url === 'string' && /^https?:\/\/.+/i.test(url);
}

async function immagineGatto() {
  // GET https://cataas.com/cat?json=true -> { url: "/cat/xxxx" }
  const data = await fetchJson('https://cataas.com/cat?json=true');
  const url = `https://cataas.com${data.url}`;
  if (!urlValida(url)) throw new Error('URL gatto non valida');
  return url;
}

async function immagineCane() {
  // GET https://dog.ceo/api/breeds/image/random -> { message: "<url>", status: "success" }
  const data = await fetchJson('https://dog.ceo/api/breeds/image/random');
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
        .setColor(0x57f287)
        .setTitle(tipo === 'cane' ? '🐶 Ecco un cane!' : '🐱 Ecco un gatto!')
        .setImage(url)
        .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({ content: FALLBACK }).catch(() => {});
    }
  },
};
