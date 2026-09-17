const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { runOnce, lastRun } = require('../../jobs/selfImprove');
const { aiStatus } = require('../../utils/ai');

function runEmbed(entry, title) {
  return new EmbedBuilder()
    .setColor(entry.applied ? 0x57f287 : 0x5865f2)
    .setTitle(title)
    .setDescription(
      `**Verdetto:** \`${entry.verdict}\`\n` +
      (entry.file ? `**File:** \`${entry.file}\`\n` : '') +
      `**Motivo:** ${String(entry.reason || entry.detail || '-').slice(0, 1200)}\n` +
      (entry.ms != null ? `**Durata:** ${Math.round(entry.ms / 1000)}s\n` : '') +
      (entry.dryRun ? '*Dry-run: nessuna modifica applicata.*' : '*Usa `git diff` per revisionare prima di committare.*')
    )
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('selfimprove')
    .setDescription('Auto-miglioramento notturno del bot (stato, prova, esecuzione)')
    .addSubcommand((s) => s.setName('stato').setDescription('Stato: attivo? ultima run? provider AI?'))
    .addSubcommand((s) => s.setName('prova').setDescription('Prova ora in dry-run (propone senza applicare)'))
    .addSubcommand((s) => s.setName('esegui').setDescription('Esegui ora il ciclo completo (applica se i test passano)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 60,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve **Gestisci Server**.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const ai = aiStatus();

    if (sub === 'stato') {
      const last = lastRun();
      const lastLine = last
        ? '`' + last.verdict + '`' + (last.file ? ' su `' + last.file + '`' : '') + ' — <t:' + Math.floor(last.at / 1000) + ':R>'
        : 'mai';
      const schedLine = process.env.SELF_IMPROVE === '1'
        ? '✅ attivo (ore ' + (process.env.SELF_IMPROVE_TIME || '22:00') + ')'
        : '❌ disattivato (`SELF_IMPROVE=1` nel .env)';
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🌙 Self-improvement')
        .setDescription(
          '**Scheduler:** ' + schedLine + (process.env.SELF_IMPROVE_DRY_RUN === '1' ? ' — dry-run' : '') + '\n' +
          '**Provider AI:** ' + ai.label + ' (' + ai.model + ')\n' +
          '**Ultima run:** ' + lastLine + '\n\n' +
          'Ogni sera il bot rilegge il suo codice e propone **una** piccola patch. ' +
          'Viene applicata solo se `node --check` + smoke test passano, altrimenti rollback automatico. Mai commit automatici.'
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const entry = await runOnce(interaction.client, { dryRun: sub === 'prova' });
      await interaction.editReply({ embeds: [runEmbed(entry, sub === 'prova' ? '🔍 Dry-run completato' : '🌙 Run completata')] });
    } catch (err) {
      await interaction.editReply({ content: `❌ Errore: ${err.message}` });
    }
  },
};
