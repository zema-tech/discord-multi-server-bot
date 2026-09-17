const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getConfig, setConfig } = require('../../database/aiConfig');
const { aiStatus } = require('../../utils/ai');

function statoEmoji(v) {
  return v ? '✅ attivata' : '❌ disattivata';
}

function mostraEmbed(cfg) {
  const prompt = cfg.systemPrompt && cfg.systemPrompt.trim()
    ? cfg.systemPrompt.trim().slice(0, 1000)
    : '— (default del bot)';
  let providerLine = '—';
  try {
    const st = aiStatus();
    providerLine = `${st.label} (${st.model})${st.free ? ' — gratis, nessuna chiave' : ''}`;
  } catch {}
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🤖 Configurazione AI')
    .setDescription(
      `🧠 Provider: **${providerLine}**\n` +
      `💬 Risposta alle menzioni: **${cfg.mentionReply ? 'ON' : 'OFF'}**\n` +
      `🛡️ Automod AI: **${cfg.automodAI ? 'ON' : 'OFF'}**\n` +
      `🎫 AI nei ticket: **${cfg.ticketAI ? 'ON' : 'OFF'}**\n` +
      `🎮 AI fun (\`/immagina\`, \`/storia\`): **${cfg.funAI ? 'ON' : 'OFF'}**\n\n` +
      `📝 Prompt di sistema:\n${prompt.slice(0, 1500)}`
    )
    .setTimestamp();
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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'mostra') {
      const cfg = getConfig(guildId);
      return interaction.reply({ embeds: [mostraEmbed(cfg)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mention') {
      const stato = interaction.options.getBoolean('stato', true);
      setConfig(guildId, { mentionReply: stato });
      return interaction.reply({
        content: `💬 Risposta alle menzioni ${statoEmoji(stato)}.${stato ? '' : ' (di default è OFF: la feature resta muta finché non la attivi.)'}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'automod-ai') {
      const stato = interaction.options.getBoolean('stato', true);
      setConfig(guildId, { automodAI: stato });
      return interaction.reply({ content: `🛡️ Automod AI ${statoEmoji(stato)}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'ticket-ai') {
      const stato = interaction.options.getBoolean('stato', true);
      setConfig(guildId, { ticketAI: stato });
      return interaction.reply({ content: `🎫 AI nei ticket ${statoEmoji(stato)}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'fun-ai') {
      const stato = interaction.options.getBoolean('stato', true);
      setConfig(guildId, { funAI: stato });
      return interaction.reply({ content: `🎮 Comandi fun AI ${statoEmoji(stato)}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'prompt') {
      const testo = interaction.options.getString('testo', true).trim();
      if (!testo) {
        return interaction.reply({ content: '❌ Il prompt non può essere vuoto.', flags: MessageFlags.Ephemeral });
      }
      setConfig(guildId, { systemPrompt: testo.slice(0, 1000) });
      return interaction.reply({ content: '📝 Prompt di sistema aggiornato.', flags: MessageFlags.Ephemeral });
    }

    // prompt-reset
    setConfig(guildId, { systemPrompt: null });
    return interaction.reply({ content: '📝 Prompt di sistema ripristinato al default.', flags: MessageFlags.Ephemeral });
  },
};
