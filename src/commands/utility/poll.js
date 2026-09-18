const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const ms = require('ms');

// Theme condiviso con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2, success: 0x57f287 };
let bar = (cur, max, len = 10) => {
  const c = Number(cur);
  const m = Number(max);
  let ratio = 0;
  if (Number.isFinite(c) && Number.isFinite(m) && m > 0) {
    ratio = Math.max(0, Math.min(1, c / m));
    if (!Number.isFinite(ratio)) ratio = 0;
  }
  const filled = Math.round(ratio * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};
let num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
let truncate = (s, max) => {
  const str = typeof s === 'string' ? s : String(s ?? '');
  const m = Math.floor(Number(max));
  if (!Number.isFinite(m) || m < 0) return str;
  return str.length <= m ? str : str.slice(0, m);
};
try {
  const theme = require('../../utils/theme');
  if (theme?.COLORS) COLORS = theme.COLORS;
  if (typeof theme?.bar === 'function') bar = theme.bar;
  if (typeof theme?.num === 'function') num = theme.num;
  if (typeof theme?.truncate === 'function') truncate = theme.truncate;
} catch {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea un sondaggio con reazioni')
    .addStringOption((o) => o.setName('domanda').setDescription('La domanda del sondaggio').setRequired(true))
    .addStringOption((o) => o.setName('opzioni').setDescription('Opzioni separate da | (max 10, default Sì/No)').setRequired(false))
    .addStringOption((o) => o.setName('durata').setDescription('Chiusura automatica: 10m, 1h, 1d (opzionale)').setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    // Titolo embed max 256 char, descrizione max 4096: le opzioni slash non hanno maxLength.
    const question = String(interaction.options.getString('domanda') || '').slice(0, 200);
    const raw = interaction.options.getString('opzioni');
    const durataRaw = interaction.options.getString('durata');
    const options = raw ? raw.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 10).map((o) => o.slice(0, 100)) : ['Sì', 'No'];
    if (options.length < 2) return interaction.reply({ content: '❌ Servono almeno 2 opzioni.', flags: MessageFlags.Ephemeral });

    let autoCloseMs = null;
    if (durataRaw) {
      autoCloseMs = ms(durataRaw);
      if (!autoCloseMs || autoCloseMs < 30000 || autoCloseMs > 7 * 24 * 3600 * 1000)
        return interaction.reply({ content: '❌ Durata non valida (min 30s, max 7g). Esempi: `10m`, `1h`, `1d`.', flags: MessageFlags.Ephemeral });
    }

    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const desc = options.map((o, i) => `${emoji[i]} **${truncate(o, 100)}**`).join('\n');
    const endsAt = autoCloseMs ? Date.now() + autoCloseMs : null;
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(truncate(`📊 ${question}`, 256))
      .setDescription(truncate(`🗳️ **Vota con le reazioni!**\n\n${desc}` + (endsAt ? `\n\n⏳ Chiude <t:${Math.floor(endsAt / 1000)}:R> • 🗳️ 0 voti finora` : ''), 4000))
      .setFooter({ text: truncate(`Sondaggio di ${interaction.user.tag} • ${options.length} opzioni`, 200) })
      .setTimestamp();
    let message;
    try {
      const msg = await interaction.reply({ embeds: [embed], withResponse: true });
      // BUGFIX: resource.message può mancare -> fallback a fetchReply, altrimenti react crashava su undefined.
      message = msg?.resource?.message ?? await interaction.fetchReply().catch(() => null);
      if (!message) return;
    } catch {
      return;
    }
    for (let i = 0; i < options.length; i++) {
      const ok = await message.react(emoji[i]).catch(() => null);
      if (!ok && i === 0) {
        await interaction.followUp({ content: '⚠️ Non riesco ad aggiungere le reazioni: controlla i miei permessi nel canale (i voti potrebbero non funzionare).', flags: MessageFlags.Ephemeral }).catch(() => {});
        break;
      }
    }

    // Chiusura automatica: conta reazioni e pubblica i risultati.
    if (autoCloseMs) {
      const timer = setTimeout(async () => {
        try {
          const fresh = await message.fetch().catch(() => null);
          if (!fresh) return;
          const counts = [];
          for (let i = 0; i < options.length; i++) {
            const r = fresh.reactions.cache.get(emoji[i]);
            counts.push(r ? Math.max(0, r.count - 1) : 0); // -1 per togliere il voto del bot
          }
          const total = counts.reduce((a, b) => a + b, 0);
          const max = counts.length ? Math.max(...counts) : 0;
          const winnerIdx = counts.map((c, i) => (c === max && max > 0 ? i : -1)).filter((i) => i >= 0);
          // BUGFIX poll senza voti: total 0 -> % 0 e barra vuota via theme.bar (niente NaN/div0).
          const pctBar = (c) => {
            const pct = total > 0 ? Math.round((c / total) * 100) : 0;
            return `\`[${bar(c, total > 0 ? total : 1, 10)}]\` ${pct}%`;
          };
          const lines = options.map((o, i) => `${emoji[i]} **${truncate(o, 100)}**: **${num(counts[i])}** voti\n${pctBar(counts[i])}`).join('\n');
          const winnerLine = max <= 0 ? '😶 Nessun voto ricevuto.' : `🏆 **Vincitore${winnerIdx.length > 1 ? 'i' : ''}: ${winnerIdx.map((i) => `**${truncate(options[i], 100)}**`).join(', ')}** (${num(max)} voti) 🎉`;
          const res = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(truncate(`📊 Risultati: ${question}`, 256))
            .setDescription(truncate(`🗳️ **Totale voti: ${num(total)}**\n\n${lines}\n\n${winnerLine}`, 4000))
            .setFooter({ text: truncate(`Sondaggio di ${interaction.user.tag}`, 200) })
            .setTimestamp();
          // BUGFIX limiti: reply può fallire se il messaggio è stato cancellato -> fallback send nel canale.
          await fresh.reply({ embeds: [res] }).catch(() => message.channel?.send({ embeds: [res] }).catch(() => {}));
        } catch (e) {
          console.error('poll end:', e.message);
        }
      }, autoCloseMs);
      timer.unref?.();
    }
  },
};
