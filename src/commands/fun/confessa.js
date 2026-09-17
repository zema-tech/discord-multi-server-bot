const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getConfessioni, setCanale, secondiAttesa, registraConfessione } = require('../../database/confessioni');
const { getGuild } = require('../../database/guildConfig');

const MAX_LEN = 500;

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

    // --- /confessa imposta (solo staff con ManageGuild) ---
    if (sub === 'imposta') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Solo chi ha il permesso **Gestione server** può impostare il canale delle confessioni.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const canale = interaction.options.getChannel('canale');
      if (!canale || !canale.isTextBased()) {
        return interaction.reply({ content: '❌ Scegli un canale di testo valido.', flags: MessageFlags.Ephemeral });
      }
      const me = interaction.guild?.members?.me;
      const perms = me ? canale.permissionsFor(me) : null;
      if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({
          content: '❌ Non ho i permessi per scrivere in quel canale (mi servono **Vedere il canale** e **Inviare messaggi**).',
          flags: MessageFlags.Ephemeral,
        });
      }
      setCanale(interaction.guildId, canale.id);
      return interaction.reply({
        content: `✅ Canale delle confessioni impostato su ${canale}. Ora gli utenti possono usare \`/confessa invia\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // --- /confessa invia (anonimo, anti-abuso) ---
    if (sub === 'invia') {
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
          content: '❌ Il canale delle confessioni non è ancora stato configurato. Chiedi allo staff di usare `/confessa imposta`.',
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
          content: '❌ Il canale delle confessioni non è più disponibile. Chiedi allo staff di reimpostarlo con `/confessa imposta`.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Embed anonima: nessun autore, nessun riferimento all'utente.
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('🤫 Confessione anonima')
        .setDescription(testo.slice(0, MAX_LEN))
        .setFooter({ text: 'Inviata in forma anonima • Il team di moderazione può visionare i log' })
        .setTimestamp();

      try {
        await canale.send({ embeds: [embed] });
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
