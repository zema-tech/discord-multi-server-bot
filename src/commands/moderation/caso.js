const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { CASE_TYPES, getCase, getUserCases, addNote, removeCase, searchCases } = require('../../database/cases');
let theme = null;
try { theme = require('../../utils/theme'); } catch { theme = null; }
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
const applyFooter = theme?.applyFooter ?? ((e) => e);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));
const errEmbed = theme?.err ?? ((t) => new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '')).setTimestamp());
const okEmbed = theme?.ok ?? ((t, d) => new EmbedBuilder().setColor(COLORS.success).setTitle(String(t)).setDescription(String(d ?? '')).setTimestamp());

const TYPE_EMOJI = { warn: '⚠️', kick: '👢', ban: '🚫', timeout: '⏱️', unban: '✅', note: '📝', mute: '🔇' };

function typeChoices() {
  return CASE_TYPES.map((t) => ({ name: t, value: t }));
}

function fmtTime(at, style) {
  const ms = Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return 'n/d';
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function caseLine(c) {
  const emoji = TYPE_EMOJI[c.type] || '📌';
  const reason = truncate(c.reason || 'Nessun motivo specificato', 120);
  return `**#${c.id}** ${emoji} \`${c.type}\` — ${reason}\n<@${c.modId}> • ${fmtTime(c.at, 'R')}`;
}

function detailEmbed(c, interaction) {
  const emoji = TYPE_EMOJI[c.type] || '📌';
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${emoji} Caso #${c.id} — ${c.type}`.slice(0, 256))
    .addFields(
      { name: 'Utente', value: `<@${c.userId}> (${c.userId})`, inline: true },
      { name: 'Moderatore', value: `<@${c.modId}>`, inline: true },
      { name: 'Data', value: fmtTime(c.at, 'F'), inline: true },
      { name: 'Motivo', value: truncate(c.reason || 'Nessun motivo specificato', 1024) || 'Nessun motivo specificato' }
    )
    .setTimestamp(Number.isFinite(Number(c.at)) ? Number(c.at) : Date.now());
  if (interaction) applyFooter(embed, interaction);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('caso')
    .setDescription('Storico moderazione del server')
    .addSubcommand((s) =>
      s.setName('vedi').setDescription('Vedi un caso tramite ID').addStringOption((o) => o.setName('id').setDescription('ID del caso').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('utente')
        .setDescription("Vedi lo storico di un utente")
        .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
        .addStringOption((o) => o.setName('tipo').setDescription('Filtra per tipo').setRequired(false).addChoices(...typeChoices()))
    )
    .addSubcommand((s) =>
      s
        .setName('nota')
        .setDescription('Aggiungi una nota allo storico di un utente')
        .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
        .addStringOption((o) => o.setName('testo').setDescription('Testo della nota').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('elimina').setDescription('Elimina un caso dallo storico (ManageGuild)').addStringOption((o) => o.setName('id').setDescription('ID del caso').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errEmbed('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const sub = interaction.options.getSubcommand();
    const ephemeral = (payload) => interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => null);

    if (sub === 'vedi') {
      const c = getCase(interaction.guild.id, interaction.options.getString('id'));
      if (!c) return ephemeral({ embeds: [errEmbed('Caso non trovato.')] });
      return ephemeral({ embeds: [detailEmbed(c, interaction)] });
    }

    if (sub === 'utente') {
      const user = interaction.options.getUser('utente');
      if (!user) return ephemeral({ embeds: [errEmbed('Utente non valido.')] });
      const tipo = interaction.options.getString('tipo');
      const all = tipo
        ? searchCases(interaction.guild.id, { userId: user.id, type: tipo, limit: 100 })
        : getUserCases(interaction.guild.id, user.id, 100);
      if (!all.length) {
        return ephemeral({ embeds: [okEmbed('✅ Nessun caso', `${user.tag ?? user.username} non ha casi${tipo ? ` di tipo \`${tipo}\`` : ''} registrati.`)] });
      }
      const shown = all.slice(0, 10);
      const rest = all.length - shown.length;
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📋 Storico di ${user.tag ?? user.username} (${all.length})`.slice(0, 256))
        .setDescription((shown.map(caseLine).join('\n\n') + (rest > 0 ? `\n\n…e altri ${rest}.` : '')).slice(0, 4000))
        .setTimestamp();
      applyFooter(embed, interaction);
      return ephemeral({ embeds: [embed] });
    }

    if (sub === 'nota') {
      const user = interaction.options.getUser('utente');
      if (!user) return ephemeral({ embeds: [errEmbed('Utente non valido.')] });
      const testo = truncate(interaction.options.getString('testo') || '', 1024);
      if (!testo) return ephemeral({ embeds: [errEmbed('Testo della nota mancante.')] });
      const c = addNote(interaction.guild.id, { userId: user.id, modId: interaction.user.id, reason: testo });
      if (!c) return ephemeral({ embeds: [errEmbed('Impossibile salvare la nota.')] });
      return ephemeral({ embeds: [okEmbed('📝 Nota salvata', `Nota per ${user.tag ?? user.username} salvata come caso \`#${c.id}\`.`)] });
    }

    if (sub === 'elimina') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return ephemeral({ embeds: [errEmbed('Serve il permesso `ManageGuild` per eliminare un caso.')] });
      }
      const id = interaction.options.getString('id');
      const ok = removeCase(interaction.guild.id, id);
      return ephemeral({ embeds: [ok ? okEmbed('🗑️ Caso eliminato', `Caso \`#${id}\` eliminato.`) : errEmbed(`Caso \`#${id}\` non trovato.`)] });
    }

    return ephemeral({ embeds: [errEmbed('Sottocomando sconosciuto.')] });
  },
};
