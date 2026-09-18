/**
 * /inviti — statistiche invite tracker.
 * - `info [utente]`: chi ha invitato l'utente + i suoi conteggi
 *   (join attribuiti, usciti, validi = join - usciti).
 * - `classifica`: top invitanti del server (pubblica, max 10).
 *
 * Permessi: chi ha ManageGuild può vedere le info di chiunque, gli altri solo
 * le proprie. La classifica è un ranking aggregato visibile a tutti.
 */
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getStats, getLeaderboard } = require('../../database/invites');
let T;
try {
  T = require('../../utils/theme');
} catch {
  T = {
    COLORS: { primary: 0x5865f2 },
    truncate: (s, m) => String(s ?? '').slice(0, m),
    num: (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d'),
  };
}

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inviti')
    .setDescription('Statistiche inviti del server')
    .addSubcommand((sc) =>
      sc
        .setName('info')
        .setDescription('Chi ha invitato un utente e i suoi conteggi')
        .addUserOption((o) => o.setName('utente').setDescription('Utente da controllare').setRequired(false))
    )
    .addSubcommand((sc) => sc.setName('classifica').setDescription('Top invitanti del server')),
  cooldown: 3,
  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
      }
      const sub = interaction.options.getSubcommand();

      if (sub === 'classifica') {
        const top = getLeaderboard(interaction.guild.id, 10);
        if (!top.length) {
          return interaction.reply({ content: '📊 Nessun dato inviti ancora. I join verranno tracciati da ora in poi.', flags: MessageFlags.Ephemeral });
        }
        const lines = top.map((e, i) => {
          const medal = MEDALS[i] || `\`${i + 1}.\``;
          const crown = i === 0 ? ' 👑' : '';
          // DB parziale/corrotto: valid può arrivare negativo (leaves > joins) — clamp a 0.
          const valid = Math.max(0, Number(e.valid) || 0);
          const joins = Math.max(0, Number(e.joins) || 0);
          const leaves = Math.max(0, Number(e.leaves) || 0);
          return `${medal} <@${e.userId}> — **${T.num(valid)}** validi${crown} (✅ ${T.num(joins)} / ❌ ${T.num(leaves)})`;
        });
        const embed = new EmbedBuilder()
          .setColor(0xfbd000)
          .setTitle(T.truncate(`📊 Classifica inviti — ${interaction.guild.name}`, 256))
          .setDescription(T.truncate(`🏆 **Top ${top.length} invitanti**\n\n${lines.join('\n')}`, 4000))
          .setFooter({ text: T.truncate(`Totale invitanti tracciati: ${top.length}`, 200) })
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      }

      // sub === 'info'
      const target = interaction.options.getUser('utente') || interaction.user;
      const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (target.id !== interaction.user.id && !isStaff) {
        return interaction.reply({ content: '❌ Puoi vedere solo le tue statistiche. Serve **Gestisci Server** per quelle degli altri.', flags: MessageFlags.Ephemeral });
      }
      if (target.bot) {
        return interaction.reply({ content: '❌ I bot non hanno statistiche inviti.', flags: MessageFlags.Ephemeral });
      }

      const stats = getStats(interaction.guild.id, target.id);
      // Clamp: con DB parziali leaves può superare joins → valid negativo assurdo.
      const joins = Math.max(0, Number(stats.joins) || 0);
      const leaves = Math.max(0, Number(stats.leaves) || 0);
      const valid = Math.max(0, Number(stats.valid) || 0);
      const tag = target.tag ?? target.username ?? 'Utente';
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(T.truncate(`📨 Inviti — ${tag}`, 256))
        .setDescription(stats.invitedBy ? `👤 Invitato da <@${stats.invitedBy}>` : '❓ Invitato da: sconosciuto')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '✅ Join attribuiti', value: `**${T.num(joins)}**`, inline: true },
          { name: '❌ Usciti', value: `**${T.num(leaves)}**`, inline: true },
          { name: '📊 Inviti validi', value: `**${T.num(valid)}** 🏆`, inline: true }
        )
        .setFooter({ text: T.truncate(interaction.guild.name, 200) })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } catch (e) {
      console.error('inviti:', e.message);
      const payload = { content: '❌ Errore durante il recupero delle statistiche.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
