const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const {
  list,
  get,
  create,
  update,
  remove,
  validateName,
  resolveVariables,
  MAX_COMMANDS,
  MAX_RESPONSE,
} = require('../../database/customCommands');

// Contesto per l'anteprima: variabili risolte sull'utente che esegue /comando.
function previewContext(interaction) {
  return {
    userMention: `${interaction.user}`,
    username: interaction.user.username,
    serverName: interaction.guild?.name || 'questo server',
    count: get(interaction.guildId, interaction.options.getString('nome', false) || '')?.uses || 0,
    channelRef: interaction.channelId ? `<#${interaction.channelId}>` : '',
    dateStr: new Date().toLocaleDateString('it-IT'),
  };
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

      if (sub === 'crea') {
        const nome = interaction.options.getString('nome', true);
        const risposta = interaction.options.getString('risposta', true);
        const res = create(guildId, nome, risposta, interaction.user.id);
        if (!res.ok) {
          return interaction.reply({ content: `❌ ${res.error}`, flags: MessageFlags.Ephemeral });
        }
        const anteprima = resolveVariables(risposta, previewContext(interaction));
        return interaction.reply({
          content: `✅ Comando \`!${res.name}\` creato.\n👁️ **Anteprima:**\n${anteprima.slice(0, 1500)}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'modifica') {
        const nome = interaction.options.getString('nome', true);
        const risposta = interaction.options.getString('risposta', true);
        const res = update(guildId, nome, risposta);
        if (!res.ok) {
          return interaction.reply({ content: `❌ ${res.error}`, flags: MessageFlags.Ephemeral });
        }
        const anteprima = resolveVariables(risposta, previewContext(interaction));
        return interaction.reply({
          content: `✅ Comando \`!${res.name}\` aggiornato.\n👁️ **Anteprima:**\n${anteprima.slice(0, 1500)}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'elimina') {
        const nome = interaction.options.getString('nome', true);
        const v = validateName(nome);
        if (!v.ok) {
          return interaction.reply({ content: `❌ ${v.error}`, flags: MessageFlags.Ephemeral });
        }
        const deleted = remove(guildId, v.value);
        return interaction.reply({
          content: deleted ? `✅ Comando \`!${v.value}\` eliminato.` : `❌ Nessun comando \`!${v.value}\`.`,
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
