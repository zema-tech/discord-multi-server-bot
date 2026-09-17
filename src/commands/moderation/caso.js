const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { CASE_TYPES, getCase, getUserCases, addNote, removeCase, searchCases } = require('../../database/cases');

const TYPE_EMOJI = { warn: '⚠️', kick: '👢', ban: '🚫', timeout: '⏱️', unban: '✅', note: '📝', mute: '🔇' };

function typeChoices() {
  return CASE_TYPES.map((t) => ({ name: t, value: t }));
}

function caseLine(c) {
  const emoji = TYPE_EMOJI[c.type] || '📌';
  return `**#${c.id}** ${emoji} \`${c.type}\` — ${c.reason}\n<@${c.modId}> • <t:${Math.floor(c.at / 1000)}:R>`;
}

function detailEmbed(c) {
  const emoji = TYPE_EMOJI[c.type] || '📌';
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${emoji} Caso #${c.id} — ${c.type}`)
    .addFields(
      { name: 'Utente', value: `<@${c.userId}> (${c.userId})`, inline: true },
      { name: 'Moderatore', value: `<@${c.modId}>`, inline: true },
      { name: 'Motivo', value: (c.reason || 'Nessun motivo specificato').slice(0, 1024) },
      { name: 'Data', value: `<t:${Math.floor(c.at / 1000)}:F>`, inline: true }
    )
    .setTimestamp(c.at);
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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'vedi') {
      const c = getCase(interaction.guild.id, interaction.options.getString('id'));
      if (!c) return interaction.reply({ content: '❌ Caso non trovato.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: [detailEmbed(c)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'utente') {
      const user = interaction.options.getUser('utente');
      const tipo = interaction.options.getString('tipo');
      const all = tipo
        ? searchCases(interaction.guild.id, { userId: user.id, type: tipo, limit: 100 })
        : getUserCases(interaction.guild.id, user.id, 100);
      if (!all.length) {
        return interaction.reply({ content: `✅ ${user.tag} non ha casi${tipo ? ` di tipo \`${tipo}\`` : ''} registrati.`, flags: MessageFlags.Ephemeral });
      }
      const shown = all.slice(0, 10);
      const rest = all.length - shown.length;
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📋 Storico di ${user.tag} (${all.length})`)
        .setDescription(shown.map(caseLine).join('\n\n').slice(0, 4000) + (rest > 0 ? `\n\n…e altri ${rest}.` : ''))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'nota') {
      const user = interaction.options.getUser('utente');
      const testo = interaction.options.getString('testo').slice(0, 1024);
      const c = addNote(interaction.guild.id, { userId: user.id, modId: interaction.user.id, reason: testo });
      if (!c) return interaction.reply({ content: '❌ Impossibile salvare la nota.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: `📝 Nota salvata per ${user.tag} come caso \`#${c.id}\`.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'elimina') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Serve il permesso `ManageGuild` per eliminare un caso.', flags: MessageFlags.Ephemeral });
      }
      const id = interaction.options.getString('id');
      const ok = removeCase(interaction.guild.id, id);
      return interaction.reply({ content: ok ? `🗑️ Caso \`#${id}\` eliminato.` : `❌ Caso \`#${id}\` non trovato.`, flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: '❌ Sottocomando sconosciuto.', flags: MessageFlags.Ephemeral });
  },
};
