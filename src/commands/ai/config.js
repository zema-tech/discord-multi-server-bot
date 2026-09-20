const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

function dashboardMsg(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const dest = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${dest} — sezione ${sezione}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai-config')
    .setDescription('Configura le funzioni AI del server')
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra la configurazione AI attuale'))
    .addSubcommand((s) =>
      s.setName('mention').setDescription('Risposta automatica quando il bot viene menzionato')
        .addBooleanOption((o) => o.setName('stato').setDescription('ON = risponde alle menzioni, OFF = ignora').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('automod-ai').setDescription('Analisi AI dei messaggi sospetti (automod)')
        .addBooleanOption((o) => o.setName('stato').setDescription('ON = analisi attiva, OFF = disattiva').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('ticket-ai').setDescription('Risposte AI automatiche nei ticket')
        .addBooleanOption((o) => o.setName('stato').setDescription('ON = attiva, OFF = disattiva').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('fun-ai').setDescription('Comandi fun AI (/immagina, /storia)')
        .addBooleanOption((o) => o.setName('stato').setDescription('ON = attivi, OFF = disattivi').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('prompt').setDescription('Imposta il prompt di sistema personalizzato')
        .addStringOption((o) =>
          o.setName('testo').setDescription('Prompt di sistema (max 1000 caratteri)').setRequired(true).setMaxLength(1000)
        )
    )
    .addSubcommand((s) => s.setName('prompt-reset').setDescription('Ripristina il prompt di sistema di default'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const guildId = interaction.guild.id;
    return interaction.reply({ content: dashboardMsg(guildId, 'AI'), flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
