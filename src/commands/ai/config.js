const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getConfig, setConfig } = require('../../database/aiConfig');
const { aiStatus } = require('../../utils/ai');

// theme.js con fallback inline: il file deve caricarsi anche se il require fallisce.
let _theme = null;
try {
  _theme = require('../../utils/theme');
} catch {
  _theme = null;
}
const COLORS = (_theme && _theme.COLORS) || { primary: 0x5865f2 };
const applyFooter =
  (_theme && _theme.applyFooter) ||
  ((embed, interaction) => {
    try {
      embed.setFooter({ text: `Richiesto da ${interaction?.user?.username ?? 'Utente'}` });
    } catch {}
    try {
      embed.setTimestamp();
    } catch {}
    return embed;
  });
const truncate =
  (_theme && _theme.truncate) || ((s, max) => String(s ?? '').slice(0, max));

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
    providerLine = truncate(`${st.label} (${st.model})${st.free ? ' — gratis, nessuna chiave' : ''}`, 120);
  } catch {}
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🤖 Configurazione AI')
    .setDescription(
      truncate(
        `🧠 Provider: **${providerLine}**\n` +
        `💬 Risposta alle menzioni: **${cfg.mentionReply ? 'ON' : 'OFF'}**\n` +
        `🛡️ Automod AI: **${cfg.automodAI ? 'ON' : 'OFF'}**\n` +
        `🎫 AI nei ticket: **${cfg.ticketAI ? 'ON' : 'OFF'}**\n` +
        `🎮 AI fun (\`/immagina\`, \`/storia\`): **${cfg.funAI ? 'ON' : 'OFF'}**\n\n` +
        `📝 Prompt di sistema:\n${prompt.slice(0, 1500)}`,
        4000
      )
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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'mostra') {
      let cfg;
      try {
        cfg = getConfig(guildId);
      } catch {
        return interaction.reply({ content: '⚠️ Config AI non leggibile, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const embed = mostraEmbed(cfg);
      applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'mention') {
      const stato = interaction.options.getBoolean('stato', true);
      try {
        setConfig(guildId, { mentionReply: stato });
      } catch {
        return interaction.reply({ content: '⚠️ Salvataggio non riuscito, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      return interaction.reply({
        content: `💬 Risposta alle menzioni ${statoEmoji(stato)}.${stato ? '' : ' (di default è OFF: la feature resta muta finché non la attivi.)'}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    if (sub === 'automod-ai') {
      const stato = interaction.options.getBoolean('stato', true);
      try {
        setConfig(guildId, { automodAI: stato });
      } catch {
        return interaction.reply({ content: '⚠️ Salvataggio non riuscito, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      return interaction.reply({ content: `🛡️ Automod AI ${statoEmoji(stato)}.`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'ticket-ai') {
      const stato = interaction.options.getBoolean('stato', true);
      try {
        setConfig(guildId, { ticketAI: stato });
      } catch {
        return interaction.reply({ content: '⚠️ Salvataggio non riuscito, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      return interaction.reply({ content: `🎫 AI nei ticket ${statoEmoji(stato)}.`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'fun-ai') {
      const stato = interaction.options.getBoolean('stato', true);
      try {
        setConfig(guildId, { funAI: stato });
      } catch {
        return interaction.reply({ content: '⚠️ Salvataggio non riuscito, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      return interaction.reply({ content: `🎮 Comandi fun AI ${statoEmoji(stato)}.`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'prompt') {
      const testo = interaction.options.getString('testo', true).trim();
      if (!testo) {
        return interaction.reply({ content: '❌ Il prompt non può essere vuoto.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      try {
        setConfig(guildId, { systemPrompt: testo.slice(0, 1000) });
      } catch {
        return interaction.reply({ content: '⚠️ Salvataggio non riuscito, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      return interaction.reply({ content: '📝 Prompt di sistema aggiornato.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    // prompt-reset
    try {
      setConfig(guildId, { systemPrompt: null });
    } catch {
      return interaction.reply({ content: '⚠️ Salvataggio non riuscito, riprova più tardi.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return interaction.reply({ content: '📝 Prompt di sistema ripristinato al default.', flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
