const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { askAI } = require('../../utils/ai');
const analytics = require('../../database/analytics');
const levels = require('../../database/levels');
const tickets = require('../../database/tickets');
const economy = require('../../database/economy');

const SYSTEM_PROMPT =
  'Sei un analista di community Discord. Rispondi in italiano, conciso (max 1500 caratteri).';

function num(v) {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

/**
 * Compatta i dati del server in un contesto <2500 char per l'AI.
 * Usa solo dati esistenti: nessun nuovo conteggio, nessuna stima canali.
 */
function buildContext({ giorni, totals, topLevels, topEco, ticketStats, memberCount }) {
  const g = num(giorni) || 7;
  const t = totals || { messages: 0, joins: 0, leaves: 0 };
  const righe = [];
  righe.push(`Server: membri=${memberCount ?? 'n/d'} periodo=ultimi ${g} giorni`);
  righe.push(`Attivita: msg=${num(t.messages)} join=${num(t.joins)} leave=${num(t.leaves)} net=${num(t.joins) - num(t.leaves)}`);

  const lvl = Array.isArray(topLevels) ? topLevels.slice(0, 5) : [];
  if (lvl.length > 0) {
    const top = lvl.map((e, i) => `#${i + 1} L${num(e.level)} (${num(e.messageCount)}msg)`).join(', ');
    righe.push(`Top livelli: ${top}`);
  } else {
    righe.push('Top livelli: nessun dato');
  }

  const eco = Array.isArray(topEco) ? topEco.slice(0, 5) : [];
  if (eco.length > 0) {
    const top = eco.map((e, i) => `#${i + 1} ${num(e.balance)}c`).join(', ');
    righe.push(`Top economia: ${top}`);
  } else {
    righe.push('Top economia: nessun dato');
  }

  const ts = ticketStats || { total: 0, open: 0, closed: 0, byType: {} };
  const tipi = ts.byType && typeof ts.byType === 'object'
    ? Object.entries(ts.byType).map(([k, v]) => `${k}=${num(v)}`).join(', ')
    : '';
  righe.push(
    `Ticket: tot=${num(ts.total)} aperti=${num(ts.open)} chiusi=${num(ts.closed)}${tipi ? ` (${tipi})` : ''}`
  );

  // Garanzia hard: mai sopra 2400 char (sotto il limite di 2500).
  return righe.join('\n').slice(0, 2400);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analizza')
    .setDescription('Chiedi all\u2019AI 5 insight azionabili per far crescere il server')
    .addIntegerOption((option) =>
      option
        .setName('giorni')
        .setDescription('Giorni di analytics da analizzare (1-30)')
        .setMinValue(1)
        .setMaxValue(30)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 30,
  buildContext,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: '❌ Solo chi gestisce il server può usare questo comando.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const giorni = interaction.options.getInteger('giorni') || 7;
    const guildId = interaction.guildId;

    const totals = analytics.totals(guildId, giorni);

    // DB analytics vuoto: niente chiamata AI.
    if (num(totals.messages) + num(totals.joins) + num(totals.leaves) === 0) {
      return interaction.reply({
        content: '📭 Dati insufficienti: analytics ancora vuoti, riprova tra qualche giorno.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let topLevels = [];
    let topEco = [];
    let ticketStats = { total: 0, open: 0, closed: 0, byType: {} };
    try {
      topLevels = levels.getLeaderboard(guildId, 5) || [];
    } catch {
      topLevels = [];
    }
    try {
      topEco = economy.getLeaderboard(guildId, 5) || [];
    } catch {
      topEco = [];
    }
    try {
      ticketStats = tickets.getStats(guildId) || ticketStats;
    } catch {
      // ticketStats resta al default
    }
    const memberCount = interaction.guild?.memberCount ?? null;

    const contesto = buildContext({ giorni, totals, topLevels, topEco, ticketStats, memberCount });
    const prompt =
      `Dati server (ultimi ${giorni} giorni):\n${contesto}\n\n` +
      'Dammi 5 insight azionabili in italiano per far crescere il server + 1 red flag se c\u2019è.';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let insight;
    try {
      insight = await askAI(prompt, SYSTEM_PROMPT);
    } catch {
      await interaction.editReply('⚠️ AI non disponibile, riprova più tardi.');
      return;
    }

    const saldo = num(totals.joins) - num(totals.leaves);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 Analisi server · ultimi ${giorni} giorni`)
      .addFields(
        {
          name: '📈 Numeri chiave',
          value:
            `💬 Messaggi: **${num(totals.messages)}**\n` +
            `📥 Entrati: **${num(totals.joins)}** · 📤 Usciti: **${num(totals.leaves)}** (saldo **${saldo >= 0 ? '+' : ''}${saldo}**)\n` +
            `🎟️ Ticket: **${num(ticketStats.total)}** (${num(ticketStats.open)} aperti)\n` +
            `👥 Membri: **${memberCount ?? 'n/d'}**`,
        },
        { name: '💡 Insight AI', value: String(insight || '').slice(0, 1024) || 'Nessun insight disponibile.' }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
