const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const QR_URL = 'https://api.qrserver.com/v1/create-qr-code/';
const SIZE = '512x512';
const MAX_CHARS = 500;
const DEFAULT_COLOR = '000000';

// Accetta "ff0000", "#ff0000", "f00", "#f00" -> restituisce "rrggbb" oppure null
function normalizeColor(raw) {
  if (raw == null || raw === '') return DEFAULT_COLOR;
  let v = String(raw).trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) {
    v = v
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (/^[0-9a-f]{6}$/.test(v)) return v;
  return null;
}

function buildQrUrl(text, color) {
  return `${QR_URL}?size=${SIZE}&data=${encodeURIComponent(text)}&color=${color}`;
}

module.exports = {
  // Esportate per test: validazione input
  MAX_CHARS,
  normalizeColor,
  buildQrUrl,
  data: new SlashCommandBuilder()
    .setName('qr')
    .setDescription('Genera un QR code dal testo (gratis, max 500 caratteri)')
    .addStringOption((o) =>
      o.setName('testo').setDescription('Testo o link da codificare (max 500)').setRequired(true).setMaxLength(MAX_CHARS),
    )
    .addStringOption((o) =>
      o.setName('colore').setDescription('Colore QR in esadecimale (es. ff0000 o #ff0000)').setRequired(false),
    ),
  cooldown: 3,
  async execute(interaction) {
    const testo = interaction.options.getString('testo', true).trim();
    const coloreRaw = interaction.options.getString('colore');

    if (!testo) {
      await interaction.reply({ content: '❌ Inserisci un testo da codificare.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (testo.length > MAX_CHARS) {
      await interaction.reply({
        content: `❌ Testo troppo lungo (${testo.length}/${MAX_CHARS} caratteri). Accorcialo e riprova.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const colore = normalizeColor(coloreRaw);
    if (colore === null) {
      await interaction.reply({
        content: `❌ Colore non valido: \`${coloreRaw}\`. Usa un esadecimale a 3 o 6 cifre (es. \`ff0000\` o \`#0f0\`).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Nessuna fetch: l'immagine viene caricata direttamente da Discord via URL
    const imageUrl = buildQrUrl(testo, colore);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔳 QR code')
      .setDescription(`\`${testo.slice(0, 200)}\`${testo.length > 200 ? '…' : ''}`)
      .setImage(imageUrl)
      .setFooter({ text: 'Immagine generata gratis da api.qrserver.com' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
