const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/** Palette premium condivisa. */
const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
  warn: 0xfee75c,
  gold: 0xffd700,
  purple: 0x9b59b6,
  blue: 0x3498db,
};

/**
 * Embed di successo (verde) con timestamp.
 * @param {string} title Titolo (troncato a 256)
 * @param {string} description Descrizione (troncata a 4000)
 * @returns {EmbedBuilder}
 */
function ok(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(String(title ?? '').slice(0, 256))
    .setDescription(String(description ?? '').slice(0, 4000))
    .setTimestamp();
}

/**
 * Embed di errore (rosso).
 * @param {string} text Descrizione errore (troncata a 4000)
 * @returns {EmbedBuilder}
 */
function err(text) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle('❌ Errore')
    .setDescription(String(text ?? '').slice(0, 4000))
    .setTimestamp();
}

/**
 * Embed informativo con timestamp.
 * @param {string} title Titolo (troncato a 256)
 * @param {string} description Descrizione (troncata a 4000)
 * @param {number} [color=COLORS.primary] Colore embed
 * @returns {EmbedBuilder}
 */
function info(title, description, color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color ?? COLORS.primary)
    .setTitle(String(title ?? '').slice(0, 256))
    .setDescription(String(description ?? '').slice(0, 4000))
    .setTimestamp();
}

/**
 * Applica footer "Richiesto da ..." + timestamp.
 * @param {EmbedBuilder} embed Embed da decorare
 * @param {object} interaction Interaction con user.tag
 * @returns {EmbedBuilder} Lo stesso embed
 */
function applyFooter(embed, interaction) {
  const tag = interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente';
  try {
    embed.setFooter({ text: `Richiesto da ${tag}` });
  } catch {
    // footer non critico: ignora
  }
  try {
    embed.setTimestamp();
  } catch {
    // ignora
  }
  return embed;
}

/**
 * Barra di progresso █/░, sicura su div0/NaN/negativi.
 * @param {number} cur Valore corrente
 * @param {number} max Valore massimo
 * @param {number} [len=10] Lunghezza barra
 * @returns {string}
 */
function bar(cur, max, len = 10) {
  let length = Math.floor(Number(len));
  if (!Number.isFinite(length) || length < 1) length = 10;
  if (length > 25) length = 25;
  const c = Number(cur);
  const m = Number(max);
  let ratio = 0;
  if (Number.isFinite(c) && Number.isFinite(m) && m > 0) {
    ratio = c / m;
    if (!Number.isFinite(ratio)) ratio = 0;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
  }
  const filled = Math.round(ratio * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Medaglia podio per indice 0-based, altrimenti posizione numerata.
 * @param {number} i Indice 0-based
 * @returns {string}
 */
function medal(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `**${Number(i) + 1}.**`;
}

/**
 * Formatta numero in it-IT, 'n/d' se non finito.
 * @param {number} n Valore
 * @returns {string}
 */
function num(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'n/d';
  return v.toLocaleString('it-IT');
}

/**
 * Tronca stringa in sicurezza (tollera non-stringhe).
 * @param {*} s Valore da troncare
 * @param {number} max Lunghezza massima
 * @returns {string}
 */
function truncate(s, max) {
  const str = typeof s === 'string' ? s : String(s ?? '');
  const m = Math.floor(Number(max));
  if (!Number.isFinite(m) || m < 0) return str;
  if (str.length <= m) return str;
  return str.slice(0, m);
}

/**
 * Normalizza una pagina in payload messaggio.
 * @param {*} page EmbedBuilder o payload messaggio
 * @returns {object} Payload { embeds: [...] } o originale
 */
function _toPayload(page) {
  if (page instanceof EmbedBuilder) return { embeds: [page] };
  if (page && typeof page === 'object' && (page.embeds || page.content || page.components)) return page;
  return { embeds: [page] };
}

/**
 * Paginazione con bottoni ◀ ▶. Non lancia mai.
 * @param {object} interaction CommandInteraction
 * @param {Array} pages Pagine (EmbedBuilder o payload)
 * @param {object} [opts] Opzioni
 * @param {number} [opts.timeout=60000] Timeout collector (ms)
 * @returns {Promise<object|null>} Message inviato o null
 */
async function paginate(interaction, pages, opts = {}) {
  const timeout = Number.isFinite(Number(opts?.timeout)) && Number(opts.timeout) > 0 ? Number(opts.timeout) : 60000;
  try {
    if (!interaction || !Array.isArray(pages) || pages.length === 0) return null;
    const useFollowUp = Boolean(interaction.replied || interaction.deferred);

    const buildRow = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('theme_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('theme_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      );

    // Una sola pagina: invia senza bottoni.
    if (pages.length === 1) {
      const payload = _toPayload(pages[0]);
      try {
        if (useFollowUp) return await interaction.followUp(payload);
        return await interaction.reply({ ...payload, fetchReply: true });
      } catch {
        return await interaction.followUp(payload).catch(() => null);
      }
    }

    let idx = 0;
    const first = { ..._toPayload(pages[idx]), components: [buildRow(false)] };
    let message = null;
    try {
      if (useFollowUp) {
        message = await interaction.followUp(first);
      } else {
        message = await interaction.reply({ ...first, fetchReply: true });
      }
    } catch {
      // Fallback: pagina base senza bottoni.
      try {
        message = await interaction.followUp(_toPayload(pages[0])).catch(() => null);
        if (message) return message;
      } catch {
        return null;
      }
      return message;
    }
    if (!message) return null;

    try {
      if (typeof message.createMessageComponentCollector !== 'function') return message;
      const filter = (i) => i?.user?.id === interaction.user.id;
      const collector = message.createMessageComponentCollector({ filter, time: timeout });
      collector.on('collect', async (i) => {
        try {
          if (i.customId === 'theme_prev') idx = (idx - 1 + pages.length) % pages.length;
          else if (i.customId === 'theme_next') idx = (idx + 1) % pages.length;
          else return;
          await i.update({ ..._toPayload(pages[idx]), components: [buildRow(false)] });
        } catch {
          // ignora errori di update
        }
      });
      collector.on('end', async () => {
        try {
          await message.edit({ components: [buildRow(true)] });
        } catch {
          // ignora
        }
      });
    } catch {
      // collector non critico
    }
    return message;
  } catch {
    // Fallback finale: prova a mandare pages[0], mai lanciare.
    try {
      if (interaction && Array.isArray(pages) && pages.length > 0) {
        if (interaction.replied || interaction.deferred) {
          return await interaction.followUp(_toPayload(pages[0])).catch(() => null);
        }
        return await interaction.reply({ ..._toPayload(pages[0]), fetchReply: true }).catch(() => null);
      }
    } catch {
      return null;
    }
    return null;
  }
}

module.exports = { COLORS, ok, err, info, applyFooter, bar, medal, num, truncate, paginate };
