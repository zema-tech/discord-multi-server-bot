const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
    ),
  cooldown: 10,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.' });
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

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 Analytics — ultimi ${rows.length} giorni`)
      .setDescription(
        `💬 Messaggi: **${t.messages}** (media **${(t.messages / rows.length).toFixed(1)}**/giorno)\n` +
          `📥 Entrati: **${t.joins}** (media **${(t.joins / rows.length).toFixed(1)}**/giorno)\n` +
          `📤 Usciti: **${t.leaves}**`
      )
      .addFields(
        { name: '💬 Messaggi per giorno', value: msgLines.join('\n').slice(0, 1024) },
        { name: '📥 Nuovi membri per giorno', value: joinLines.join('\n').slice(0, 1024) }
      )
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
