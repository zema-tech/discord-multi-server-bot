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
          return `${medal} <@${e.userId}> — **${e.valid}** validi (✅ ${e.joins} / ❌ ${e.leaves})`;
        });
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 Classifica inviti — ${interaction.guild.name}`)
          .setDescription(lines.join('\n').slice(0, 4000))
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
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📨 Inviti — ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {
            name: 'Invitato da',
            value: stats.invitedBy ? `<@${stats.invitedBy}>` : 'Sconosciuto',
            inline: true,
          },
          { name: 'Join attribuiti', value: `✅ ${stats.joins}`, inline: true },
          { name: 'Usciti', value: `❌ ${stats.leaves}`, inline: true },
          { name: 'Inviti validi', value: `📊 ${stats.valid}`, inline: true }
        )
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
