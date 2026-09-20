const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getConfessioni, secondiAttesa, registraConfessione } = require('../../database/confessioni');
const { getGuild } = require('../../database/guildConfig');

let _theme = null;
try {
  _theme = require('../../utils/theme');
} catch {
  _theme = null;
}
const BLUE = _theme?.COLORS?.blue ?? 0x3498db;
const truncate = _theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

const MAX_LEN = 500;

function dashboardMsg(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const dest = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${dest} — sezione ${sezione}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confessa')
    .setDescription('Confessioni anonime del server')
    .addSubcommand((s) =>
      s
        .setName('imposta')
        .setDescription('Imposta il canale dove pubblicare le confessioni anonime (staff)')
        .addChannelOption((o) =>
          o
            .setName('canale')
            .setDescription('Canale di destinazione delle confessioni')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('invia')
        .setDescription('Invia una confessione anonima (max 500 caratteri)')
        .addStringOption((o) =>
          o
            .setName('testo')
            .setDescription('La tua confessione anonima')
            .setRequired(true)
            .setMaxLength(MAX_LEN)
        )
    ),
  cooldown: 5,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // --- /confessa imposta: solo dalla dashboard (nessuna scrittura qui) ---
    if (sub === 'imposta') {
      if (!interaction.guild) {
        return interaction.reply({ content: '❌ Usabile solo in un server.', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Solo chi ha il permesso **Gestione server** può impostare il canale delle confessioni.',
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({ content: dashboardMsg(interaction.guildId, 'Confessioni'), flags: MessageFlags.Ephemeral });
    }

    // --- /confessa invia (anonimo, anti-abuso) ---
    if (sub === 'invia') {
      if (!interaction.guild) {
        return interaction.reply({ content: '❌ Usabile solo in un server.', flags: MessageFlags.Ephemeral });
      }
      const testo = (interaction.options.getString('testo') || '').trim();
      if (!testo) {
        return interaction.reply({ content: '❌ La confessione non può essere vuota.', flags: MessageFlags.Ephemeral });
      }
      if (testo.length > MAX_LEN) {
        return interaction.reply({
          content: `❌ Troppo lunga! Massimo **${MAX_LEN}** caratteri (la tua ne ha ${testo.length}).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Anti-abuso: 1 confessione ogni 60s per utente.
      const attesa = secondiAttesa(interaction.user.id);
      if (attesa > 0) {
        return interaction.reply({
          content: `⏳ Calma! Potrai inviare un\u2019altra confessione tra **${attesa} secondi**.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Filtro badWords riusato in sola lettura da guildConfig (automod).
      try {
        const cfg = getGuild(interaction.guildId);
        const badWords = cfg?.automod?.badWords;
        if (Array.isArray(badWords) && badWords.length > 0) {
          const lower = testo.toLowerCase();
          const trovata = badWords.find((w) => typeof w === 'string' && w.trim() && lower.includes(w.toLowerCase().trim()));
          if (trovata) {
            return interaction.reply({
              content: '🚫 La tua confessione contiene parole non consentite in questo server. Riformulala in modo pulito.',
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      } catch {
        // Se la config non è leggibile, non bloccare: si pubblica comunque.
      }

      const { channelId } = getConfessioni(interaction.guildId);
      if (!channelId) {
        return interaction.reply({
          content: '❌ Il canale delle confessioni non è ancora stato configurato. Chiedi allo staff di usare la dashboard (sezione Confessioni).',
          flags: MessageFlags.Ephemeral,
        });
      }

      let canale;
      try {
        canale = await interaction.guild.channels.fetch(channelId);
      } catch {
        canale = null;
      }
      if (!canale || !canale.isTextBased()) {
        return interaction.reply({
          content: '❌ Il canale delle confessioni non è più disponibile. Chiedi allo staff di reimpostarlo dalla dashboard (sezione Confessioni).',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Embed anonima: nessun autore, nessun footer "Richiesto da" (anonimato reale).
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🤫 Confessione anonima')
        .setDescription(truncate(testo, MAX_LEN))
        .setFooter({ text: 'Inviata in forma anonima' })
        .setTimestamp();

      try {
        await canale.send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch {
        return interaction.reply({
          content: '❌ Non sono riuscito a pubblicare la confessione (permessi mancanti?). Riprova più tardi.',
          flags: MessageFlags.Ephemeral,
        });
      }
      registraConfessione(interaction.user.id);
      return interaction.reply({
        content: '✅ Confessione pubblicata in forma **anonima**! 🤫',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({ content: '❌ Sottocomando sconosciuto.', flags: MessageFlags.Ephemeral });
  },
};
