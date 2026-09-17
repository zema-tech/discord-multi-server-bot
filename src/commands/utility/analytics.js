const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getDays, totals } = require('../../database/analytics');

const BAR_MAX = 10;

/** Barra testuale proporzionale: max 10 char `█`, resto `░`. */
function bar(value, max) {
  if (!max || max <= 0 || value <= 0) return '░'.repeat(BAR_MAX);
  const filled = Math.max(1, Math.round((value / max) * BAR_MAX));
  return '█'.repeat(filled) + '░'.repeat(BAR_MAX - filled);
}

/** 'YYYY-MM-DD' -> 'DD/MM' per le righe giornaliere. */
function shortDate(iso) {
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('Statistiche del server stile YouTube-Studio (messaggi e membri)')
    .addIntegerOption((o) =>
      o.setName('giorni').setDescription('Giorni da includere (default 7, max 30)').setMinValue(1).setMaxValue(30).setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.' });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server** per vedere le statistiche.' });
    }
    const n = interaction.options.getInteger('giorni') ?? 7;
    const rows = getDays(interaction.guild.id, n);
    const t = totals(interaction.guild.id, n);

    if (t.messages === 0 && t.joins === 0 && t.leaves === 0) {
      return interaction.reply({
        content: '📊 **Dati insufficienti:** non ci sono ancora statistiche per questo periodo. Torna tra qualche giorno, dopo un po’ di attività nel server!',
      });
    }

    const maxMsg = Math.max(...rows.map((r) => r.messages));
    const maxJoin = Math.max(...rows.map((r) => r.joins));

    const msgLines = rows.map((r) => `\`${shortDate(r.date)}\` ${bar(r.messages, maxMsg)} **${r.messages}**`);
    const joinLines = rows.map((r) => `\`${shortDate(r.date)}\` ${bar(r.joins, maxJoin)} **${r.joins}**`);

    // Trend oggi vs ieri (se almeno 2 giorni disponibili).
    let trendLine = '';
    if (rows.length >= 2) {
      const today = rows[rows.length - 1];
      const yesterday = rows[rows.length - 2];
      const trend = (cur, prev) => {
        if (prev === 0 && cur === 0) return '➖ stabile';
        if (prev === 0) return '▲ nuovo volume!';
        const diff = cur - prev;
        if (diff === 0) return '➖ stabile';
        const pct = Math.round((diff / prev) * 100);
        return diff > 0 ? `▲ +${diff} (+${pct}%)` : `▼ ${diff} (${pct}%)`;
      };
      trendLine = `\n📈 Trend oggi vs ieri: 💬 ${trend(today.messages, yesterday.messages)} • 📥 ${trend(today.joins, yesterday.joins)}`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 Analytics — ultimi ${rows.length} giorni`)
      .setDescription(
        `💬 Messaggi: **${t.messages}** (media **${(t.messages / rows.length).toFixed(1)}**/giorno)\n` +
          `📥 Entrati: **${t.joins}** (media **${(t.joins / rows.length).toFixed(1)}**/giorno)\n` +
          `📤 Usciti: **${t.leaves}**${trendLine}`
      )
      .addFields(
        { name: '💬 Messaggi per giorno', value: msgLines.join('\n').slice(0, 1024) || '—' },
        { name: '📥 Nuovi membri per giorno', value: joinLines.join('\n').slice(0, 1024) || '—' }
      )
      .setFooter({ text: `${interaction.guild.name} • Usa /analytics giorni:1-30`.slice(0, 200) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
