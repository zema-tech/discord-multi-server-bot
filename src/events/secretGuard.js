const { Events, EmbedBuilder } = require('discord.js');

// PELLE del sistema immunitario: token e chiavi API in chat vengono
// cancellati subito (basta un leak per perdere il bot). Pattern ad alta
// confidenza, zero tolleranza: cancella + DM + modlog, mai warn (spesso è
// un incidente, non malizia).
const PATTERNS = [
  { name: 'Token Discord', re: /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,}/ },
  { name: 'Chiave OpenAI', re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'Chiave Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'Chiave Groq', re: /\bgsk_[A-Za-z0-9]{20,}/ },
  { name: 'Chiave OpenRouter', re: /\bsk-or-[A-Za-z0-9_-]{20,}/ },
  { name: 'Token GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'Chiave AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'API key generica', re: /\bapi[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}['"]?/i },
];

function findSecret(content) {
  const text = String(content || '');
  if (!text || text.length > 4000) return null;
  for (const p of PATTERNS) {
    try {
      if (p.re.test(text)) return p.name;
    } catch {}
  }
  return null;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message.guild || !message.author || message.author.bot) return;
      if (message.system) return;
      try {
        if (!require('../modules/commander').canRun(message.guild.id, 'moderation').ok) return;
      } catch {}
      const kind = findSecret(message.content);
      if (!kind) return;

      // 1. Cancella subito (prima che venga indicizzato/letto).
      try {
        await message.delete();
      } catch {}

      // 2. DM all'autore: spiega senza riportare il segreto.
      try {
        const dm = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🛡️ Segreto rimosso')
          .setDescription(
            `Il tuo messaggio in **${message.guild.name}** conteneva quello che sembra **${kind}** ed è stato cancellato.\n\n` +
            'Rigenera subito quella credenziale (è compromessa dal momento in cui è apparsa in chat), poi ripubblica senza includerla.'
          )
          .setTimestamp();
        await message.author.send({ embeds: [dm] }).catch(() => null);
      } catch {}

      // 3. Modlog (senza contenuto: mai propagare il segreto).
      try {
        const { sendLog } = require('../utils/helpers');
        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle(`🛡️ Segreto intercettato (${kind})`)
          .addFields(
            { name: 'Autore', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
            { name: 'Canale', value: `${message.channel}`, inline: true },
            { name: 'Azione', value: 'Messaggio cancellato + DM inviato' }
          )
          .setTimestamp();
        await sendLog(message.guild, { embeds: [embed] }).catch(() => {});
      } catch {}
    } catch {}
  },
  // Riesportato per i test.
  findSecret,
};
