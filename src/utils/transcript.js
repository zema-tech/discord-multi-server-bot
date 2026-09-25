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
  const messages = await fetchMessages(channel);
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

async function fetchMessages(channel) {
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
  return messages.slice(-MAX_MESSAGES).reverse();
}

module.exports = { buildTranscript, buildHtmlTranscript };

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Transcript HTML stile open-ticket: header col meta del ticket + messaggi
 * in stile Discord (avatar, nome colorato, timestamp, allegati). Self-contained.
 * meta: { number, type, owner, priority, subject, reason, closedBy } (tutti opzionali).
 */
async function buildHtmlTranscript(channel, meta = {}) {
  const messages = await fetchMessages(channel);
  const cards = messages.map((m) => {
    const ts = Number.isFinite(m?.createdTimestamp) ? m.createdTimestamp : Date.now();
    const time = new Date(ts).toLocaleString('it-IT');
    const author = m?.author || {};
    const name = esc(author.tag || author.username || 'sconosciuto');
    const avatar = author.displayAvatarURL ? esc(author.displayAvatarURL({ size: 64 })) : '';
    const bot = author.bot ? '<span class="bot">BOT</span>' : '';
    const text = esc(truncate(m?.content || '(nessun testo)', MAX_TEXT_PER_MESSAGE)).replace(/\n/g, '<br>');
    const atts = m?.attachments ? [...m.attachments.values()].slice(0, MAX_ATTACHMENTS_PER_MESSAGE) : [];
    const attHtml = atts.map((a) => {
      const url = esc(a?.url || '');
      const nm = esc(a?.name || 'allegato');
      if (!url) return '';
      return /\.(png|jpe?g|gif|webp)$/i.test(nm)
        ? `<a href="${url}" target="_blank"><img class="att-img" src="${url}" alt="${nm}"></a>`
        : `<div class="att">📎 <a href="${url}" target="_blank">${nm}</a></div>`;
    }).join('');
    const embHtml = (Array.isArray(m?.embeds) && m.embeds.length)
      ? `<div class="att">${m.embeds.length} embed allegati al messaggio</div>` : '';
    const color = esc(colorFor(name));
    return `<div class="msg"><img class="avatar" src="${avatar}" alt="" onerror="this.style.display='none'">` +
      `<div><div class="head"><span class="user" style="color:${color}">${name}</span>${bot}<span class="time">${esc(time)}</span></div>` +
      `<div class="text">${text}</div>${attHtml}${embHtml}</div></div>`;
  }).join('\n');

  const rows = [
    ['Numero', meta.number != null ? `#${meta.number}` : '—'],
    ['Tipo', esc(meta.type || '—')],
    ['Proprietario', esc(meta.owner || '—')],
    ['Priorità', esc(meta.priority || '—')],
    ['Oggetto', esc(meta.subject || '—')],
    ['Chiuso da', esc(meta.closedBy || '—')],
    ['Motivo', esc(meta.reason || '—')],
    ['Messaggi', String(messages.length)],
    ['Generato', new Date().toLocaleString('it-IT')],
  ].map(([k, v]) => `<div class="mrow"><span>${esc(k)}</span><b>${v}</b></div>`).join('\n');

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Transcript ${esc(channel?.name || 'ticket')}</title><style>` +
    `body{background:#313338;color:#dbdee1;font-family:Whitney,'Helvetica Neue',Arial,sans-serif;margin:0;padding:24px}` +
    `.wrap{max-width:900px;margin:auto}.meta{background:#2b2d31;border-radius:8px;padding:16px;margin-bottom:16px}` +
    `.meta h1{font-size:18px;margin:0 0 12px}.mrow{display:flex;gap:8px;font-size:14px;padding:3px 0}` +
    `.mrow span{color:#949ba4;min-width:110px}.msg{display:flex;gap:12px;padding:8px 4px;border-top:1px solid #3f4147}` +
    `.avatar{width:40px;height:40px;border-radius:50%}.head{font-size:14px}.user{font-weight:600}` +
    `.bot{background:#5865f2;color:#fff;font-size:10px;border-radius:4px;padding:1px 4px;margin-left:6px}` +
    `.time{color:#949ba4;font-size:12px;margin-left:8px}.text{font-size:15px;white-space:pre-wrap;word-break:break-word}` +
    `.att{font-size:13px;color:#949ba4;margin-top:4px}.att-img{max-width:400px;max-height:300px;border-radius:8px;margin-top:4px}` +
    `a{color:#00a8fc}</style></head><body><div class="wrap">` +
    `<div class="meta"><h1>🎫 Transcript ${esc(channel?.name || '')}</h1>${rows}</div>${cards}</div></body></html>`;
  const capped = html.length > MAX_TOTAL_CHARS * 4 ? html.slice(0, MAX_TOTAL_CHARS * 4) + '<!-- troncato -->' : html;
  return new AttachmentBuilder(Buffer.from(capped, 'utf-8'), {
    name: `transcript-${safeName(channel?.name)}.html`,
  });
}

/** Colore stabile per utente (hash del nome -> palette Discord). */
function colorFor(name) {
  const palette = ['#e91e63', '#9c27b0', '#3f51b5', '#03a9f4', '#009688', '#8bc34a', '#ff9800', '#ff5722'];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
