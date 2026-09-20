const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const {
  list,
  MAX_COMMANDS,
  MAX_RESPONSE,
} = require('../../database/customCommands');

// Configurazione solo dalla dashboard web: nessun accesso in scrittura al DB da qui.
function dashboardMessaggio(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '') || 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${base}/app.html#gid=${guildId} — sezione ${sezione}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comando')
    .setDescription('Custom commands del server: trigger !nome con risposta personalizzata (stile PeakBot)')
    .addSubcommand((s) =>
      s
        .setName('crea')
        .setDescription('Crea un custom command !nome')
        .addStringOption((o) =>
          o.setName('nome').setDescription('Nome senza "!" (2-20 caratteri: a-z, 0-9, "-")').setRequired(true).setMinLength(2).setMaxLength(20)
        )
        .addStringOption((o) =>
          o
            .setName('risposta')
            .setDescription('Testo di risposta (variabili: {user} {username} {server} {count} {channel} {date})')
            .setRequired(true)
            .setMaxLength(MAX_RESPONSE)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('modifica')
        .setDescription('Modifica la risposta di un custom command')
        .addStringOption((o) => o.setName('nome').setDescription('Nome del comando senza "!"').setRequired(true).setMinLength(2).setMaxLength(20))
        .addStringOption((o) =>
          o.setName('risposta').setDescription('Nuovo testo di risposta').setRequired(true).setMaxLength(MAX_RESPONSE)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('elimina')
        .setDescription('Elimina un custom command')
        .addStringOption((o) => o.setName('nome').setDescription('Nome del comando senza "!"').setRequired(true).setMinLength(2).setMaxLength(20))
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra tutti i custom command del server'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Ti serve il permesso **Gestisci Server** per usare questo comando.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      // Configurazione (crea/modifica/elimina) solo dalla dashboard web.
      if (sub === 'crea' || sub === 'modifica' || sub === 'elimina') {
        return interaction.reply({
          content: dashboardMessaggio(guildId, 'Comandi custom (!nome)'),
          flags: MessageFlags.Ephemeral,
        });
      }

      // lista
      const commands = list(guildId);
      if (!commands.length) {
        return interaction.reply({
          content: '📭 Nessun custom command. Creane uno con `/comando crea`.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const lines = commands.slice(0, 20).map((c, i) => {
        const raw = String(c.response || '');
        const preview = raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
        return `🔹 ${i + 1}. \`!${c.name}\` (usato ${Number(c.uses) || 0}×) → ${preview}`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔹 Custom commands (${commands.length}/${MAX_COMMANDS})`.slice(0, 256))
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: 'Trigger: !nome a inizio messaggio • Variabili: {user} {username} {server} {count} {channel} {date}'.slice(0, 200) })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (e) {
      console.error('comando:', e.message);
      const payload = { content: '❌ Errore durante l’operazione.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
