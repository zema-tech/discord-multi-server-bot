const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

// Theme condiviso con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2 };
let truncate = (s, max) => {
  const str = typeof s === 'string' ? s : String(s ?? '');
  const m = Math.floor(Number(max));
  if (!Number.isFinite(m) || m < 0) return str;
  return str.length <= m ? str : str.slice(0, m);
};
let applyFooter = (embed, interaction) => {
  try { embed.setTimestamp(); } catch {}
  return embed;
};
try {
  const theme = require('../../utils/theme');
  if (theme?.COLORS) COLORS = theme.COLORS;
  if (typeof theme?.truncate === 'function') truncate = theme.truncate;
  if (typeof theme?.applyFooter === 'function') applyFooter = theme.applyFooter;
} catch {}

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
      // BUGFIX limiti: coloreRaw senza maxLength poteva sforare i 2000 char della reply -> troncato.
      await interaction.reply({
        content: `❌ Colore non valido: \`${truncate(String(coloreRaw ?? ''), 50)}\`. Usa un esadecimale a 3 o 6 cifre (es. \`ff0000\` o \`#0f0\`).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Nessuna fetch: l'immagine viene caricata direttamente da Discord via URL
    const imageUrl = buildQrUrl(testo, colore);
    // BUGFIX: backtick nel testo rompevano il code-format -> sanitizzati; descrizione entro i limiti via truncate.
    const safePreview = truncate(testo.replace(/`/g, '´'), 200);
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🔳 QR code')
      .setDescription(`\`${safePreview}\`${testo.length > 200 ? '…' : ''}\n🎨 Colore: \`#${colore}\` • 📏 \`${testo.length}/${MAX_CHARS}\``)
      .setImage(imageUrl)
      .setFooter({ text: truncate('Immagine generata gratis da api.qrserver.com', 200) });
    applyFooter(embed, interaction);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
