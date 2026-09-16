const { AttachmentBuilder } = require('discord.js');

/** Genera un transcript .txt di un canale ticket (max 1000 messaggi). */
async function buildTranscript(channel) {
  let messages = [];
  let before = null;

  while (messages.length < 1000) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.reverse();

  const lines = messages.map((m) => {
    const time = new Date(m.createdTimestamp).toLocaleString('it-IT');
    let text = m.content || '(nessun testo)';
    if (m.attachments.size) {
      text += ' [allegati: ' + [...m.attachments.values()].map((a) => a.url).join(', ') + ']';
    }
    if (m.embeds.length) text += ` [${m.embeds.length} embed]`;
    return `[${time}] ${m.author.tag}: ${text}`;
  });

  const header = `Transcript del ticket #${channel.name} (${channel.id})\nGenerato: ${new Date().toLocaleString('it-IT')}\nMessaggi: ${lines.length}\n${'='.repeat(50)}\n`;
  return new AttachmentBuilder(Buffer.from(header + lines.join('\n'), 'utf-8'), {
    name: `transcript-${channel.name}.txt`,
  });
}

module.exports = { buildTranscript };
