const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { runOnce, lastRun } = require('../../jobs/selfImprove');
const { aiStatus } = require('../../utils/ai');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}

const truncate = theme?.truncate ?? ((s, max) => String(s ?? '').slice(0, max));

function withFooter(embed, interaction) {
  if (theme?.applyFooter) {
    try {
      theme.applyFooter(embed, interaction);
    } catch {
      // footer non critico
    }
    return embed;
  }
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente'}` });
  } catch {
    // ignora
  }
  return embed;
}

function errorEmbed(text, interaction) {
  const e = theme?.err ? theme.err(text) : new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text ?? '').slice(0, 4000)).setTimestamp();
  return interaction ? withFooter(e, interaction) : e;
}

function runEmbed(entry, title, interaction) {
  const desc =
    `**Verdetto:** \`${entry.verdict}\`\n` +
    (entry.file ? `**File:** \`${entry.file}\`\n` : '') +
    `**Motivo:** ${truncate(entry.reason || entry.detail || '-', 1200)}\n` +
    (entry.ms != null ? `**Durata:** ${Math.round(entry.ms / 1000)}s\n` : '') +
    (entry.dryRun ? '*Dry-run: nessuna modifica applicata.*' : '*Usa `git diff` per revisionare prima di committare.*');
  let embed;
  if (entry.applied && theme?.ok) embed = theme.ok(title, desc);
  else if (theme?.info) embed = theme.info(title, desc, entry.applied ? theme.COLORS.success : theme.COLORS.primary);
  else {
    embed = new EmbedBuilder()
      .setColor(entry.applied ? 0x57f287 : 0x5865f2)
      .setTitle(String(title).slice(0, 256))
      .setDescription(String(desc).slice(0, 4000))
      .setTimestamp();
  }
  return withFooter(embed, interaction);
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
      return interaction.reply({ embeds: [errorEmbed('Usa questo comando dentro un server.', interaction)], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [errorEmbed('Ti serve **Gestisci Server**.', interaction)], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const sub = interaction.options.getSubcommand();
    let ai;
    try {
      ai = aiStatus();
    } catch {
      ai = { label: 'n/d', model: 'n/d' };
    }

    if (sub === 'stato') {
      const last = lastRun();
      const lastLine = last
        ? '`' + last.verdict + '`' + (last.file ? ' su `' + last.file + '`' : '') + ' — <t:' + Math.floor(last.at / 1000) + ':R>'
        : 'mai';
      const schedLine = process.env.SELF_IMPROVE === '1'
        ? '✅ attivo (ore ' + (process.env.SELF_IMPROVE_TIME || '22:00') + ')'
        : '❌ disattivato (`SELF_IMPROVE=1` nel .env)';
      const desc =
        '**Scheduler:** ' + schedLine + (process.env.SELF_IMPROVE_DRY_RUN === '1' ? ' — dry-run' : '') + '\n' +
        '**Provider AI:** ' + ai.label + ' (' + ai.model + ')\n' +
        '**Ultima run:** ' + lastLine + '\n\n' +
        'Ogni sera il bot rilegge il suo codice e propone **una** piccola patch. ' +
        'Viene applicata solo se `node --check` + smoke test passano, altrimenti rollback automatico. Mai commit automatici.';
      const embed = theme?.info
        ? withFooter(theme.info('🌙 Self-improvement', desc), interaction)
        : withFooter(new EmbedBuilder().setColor(0x5865f2).setTitle('🌙 Self-improvement').setDescription(desc.slice(0, 4000)).setTimestamp(), interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    // Defer protetto: se fallisce (interaction scaduta), si ripiega su reply/followUp.
    let deferred = false;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;
    } catch {
      deferred = Boolean(interaction.deferred || interaction.replied);
    }
    try {
      const entry = await runOnce(interaction.client, { dryRun: sub === 'prova' });
      const embed = runEmbed(entry, sub === 'prova' ? '🔍 Dry-run completato' : '🌙 Run completata', interaction);
      if (deferred || interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] }).catch(() => interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null));
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? 'sconosciuto');
      const payload = { embeds: [errorEmbed(`Errore: ${truncate(msg, 1500)}`, interaction)], flags: MessageFlags.Ephemeral };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => null));
        } else {
          await interaction.reply(payload).catch(() => interaction.followUp(payload).catch(() => null));
        }
      } catch {
        // mai lanciare dal catch
      }
    }
  },
};
