const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getDays, totals } = require('../../database/analytics');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}

const bar = theme?.bar ?? ((value, max, len = 10) => {
  const L = Math.max(1, Math.min(25, Math.floor(Number(len)) || 10));
  const c = Number(value);
  const m = Number(max);
  let ratio = 0;
  if (Number.isFinite(c) && Number.isFinite(m) && m > 0) ratio = Math.max(0, Math.min(1, c / m));
  const filled = Math.round(ratio * L);
  return '█'.repeat(filled) + '░'.repeat(L - filled);
});
const num = theme?.num ?? ((n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d'));
const truncate = theme?.truncate ?? ((s, max) => String(s ?? '').slice(0, max));

/** 'YYYY-MM-DD' -> 'DD/MM'; fallback sicuro su formati inattesi. */
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return String(iso ?? '?').slice(0, 10);
  return `${m[3]}/${m[2]}`;
}

function errorEmbed(text) {
  if (theme?.err) return theme.err(text);
  return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text ?? '').slice(0, 4000)).setTimestamp();
}

function hasManageGuild(interaction) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  try {
    return Boolean(perms?.has(PermissionFlagsBits.ManageGuild));
  } catch {
    return false;
  }
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
      return interaction.reply({ embeds: [errorEmbed('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (!hasManageGuild(interaction)) {
      return interaction.reply({ embeds: [errorEmbed('Ti serve il permesso **Gestisci Server** per vedere le statistiche.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    try {
      // FIX: clamp difensivo (lo slash limita 1-30, ma il valore può arrivare anche da chiamate interne).
      const raw = interaction.options.getInteger('giorni') ?? 7;
      const n = Math.max(1, Math.min(30, Math.floor(Number(raw)) || 7));
      const rows = getDays(interaction.guild.id, n);
      const t = totals(interaction.guild.id, n);
      if (!Array.isArray(rows) || rows.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('Dati non disponibili al momento, riprova più tardi.')], flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      if (t.messages === 0 && t.joins === 0 && t.leaves === 0) {
        const empty = theme?.info
          ? theme.info('📊 Analytics', 'Dati insufficienti: non ci sono ancora statistiche per questo periodo. Torna tra qualche giorno, dopo un po’ di attività nel server!')
          : new EmbedBuilder().setColor(0x5865f2).setTitle('📊 Analytics').setDescription('Dati insufficienti: non ci sono ancora statistiche per questo periodo. Torna tra qualche giorno, dopo un po’ di attività nel server!').setTimestamp();
        return interaction.reply({ embeds: [empty] }).catch(() => null);
      }

      const maxMsg = Math.max(0, ...rows.map((r) => Number(r.messages) || 0));
      const maxJoin = Math.max(0, ...rows.map((r) => Number(r.joins) || 0));

      const msgLines = rows.map((r) => `\`${shortDate(r.date)}\` ${bar(r.messages, maxMsg)} **${num(r.messages)}**`);
      const joinLines = rows.map((r) => `\`${shortDate(r.date)}\` ${bar(r.joins, maxJoin)} **${num(r.joins)}**`);

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

      const desc =
        `💬 Messaggi: **${num(t.messages)}** (media **${(t.messages / rows.length).toFixed(1)}**/giorno)\n` +
        `📥 Entrati: **${num(t.joins)}** (media **${(t.joins / rows.length).toFixed(1)}**/giorno)\n` +
        `📤 Usciti: **${num(t.leaves)}**${trendLine}`;
      let embed;
      if (theme?.info) {
        embed = theme.info(`📊 Analytics — ultimi ${rows.length} giorni`, desc);
      } else {
        embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 Analytics — ultimi ${rows.length} giorni`)
          .setDescription(desc.slice(0, 4000))
          .setTimestamp();
      }
      embed.addFields(
        { name: '💬 Messaggi per giorno', value: truncate(msgLines.join('\n'), 1024) || '—' },
        { name: '📥 Nuovi membri per giorno', value: truncate(joinLines.join('\n'), 1024) || '—' }
      );
      if (theme?.applyFooter) {
        try {
          theme.applyFooter(embed, interaction);
        } catch {
          // ignora
        }
      } else {
        try {
          embed.setFooter({ text: `${interaction.guild.name} • Usa /analytics giorni:1-30`.slice(0, 200) });
        } catch {
          // ignora
        }
      }

      await interaction.reply({ embeds: [embed] }).catch(() => null);
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? 'sconosciuto');
      const payload = { embeds: [errorEmbed(`Errore nel caricamento delle statistiche: ${truncate(msg, 500)}`)], flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
        else await interaction.reply(payload).catch(() => null);
      } catch {
        // mai lanciare
      }
      return null;
    }
  },
};
