const { AttachmentBuilder } = require('discord.js');

// Tetti anti-OOM su canali enormi: 1000 messaggi max, testo troncato per messaggio,
// buffer totale limitato (allegati/URL inclusi).
const MAX_MESSAGES = 1000;
const MAX_TEXT_PER_MESSAGE = 1500;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_TOTAL_CHARS = 500000;

function safeName(name) {
  return String(name ?? 'ticket').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 64) || 'ticket';
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + '… [troncato]' : str;
}

/** Genera un transcript .txt di un canale ticket (max 1000 messaggi). */
async function buildTranscript(channel) {
  let messages = [];
  let before = null;

  while (messages.length < MAX_MESSAGES) {
    let batch = null;
    try {
      batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    } catch {
      break; // permessi revocati / canale eliminato: restituisci il parziale
    }
    if (!batch || !batch.size) break;
    messages.push(...batch.values());
    const lastMsg = typeof batch.last === 'function' ? batch.last() : [...batch.values()].pop();
    before = lastMsg?.id;
    if (!before || batch.size < 100) break;
  }
  messages = messages.slice(-MAX_MESSAGES).reverse();

  const lines = messages.map((m) => {
    const ts = Number.isFinite(m?.createdTimestamp) ? m.createdTimestamp : Date.now();
    const time = new Date(ts).toLocaleString('it-IT');
    let text = truncate(m?.content || '(nessun testo)', MAX_TEXT_PER_MESSAGE);
    const atts = m?.attachments ? [...m.attachments.values()].slice(0, MAX_ATTACHMENTS_PER_MESSAGE) : [];
    if (atts.length) {
      text += ' [allegati: ' + atts.map((a) => a?.url || '?').join(', ') + ']';
    }
    const nEmbeds = Array.isArray(m?.embeds) ? m.embeds.length : 0;
    if (nEmbeds) text += ` [${nEmbeds} embed]`;
    const tag = m?.author?.tag || 'sconosciuto';
    return `[${time}] ${tag}: ${text}`;
  });

  const header = `Transcript del ticket #${channel?.name || '?'} (${channel?.id || '?'})\nGenerato: ${new Date().toLocaleString('it-IT')}\nMessaggi: ${lines.length}\n${'='.repeat(50)}\n`;
  let body = header + lines.join('\n');
  if (body.length > MAX_TOTAL_CHARS) body = body.slice(0, MAX_TOTAL_CHARS) + '\n… [transcript troncato per dimensione]';
  return new AttachmentBuilder(Buffer.from(body, 'utf-8'), {
    name: `transcript-${safeName(channel?.name)}.txt`,
  });
}

module.exports = { buildTranscript };
