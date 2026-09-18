const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} = require('discord.js');

const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

// Tema premium condiviso, con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
let applyFooter = (embed, interaction) => {
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente'}`.slice(0, 200) });
    embed.setTimestamp();
  } catch { /* footer non critico */ }
  return embed;
};
let truncate = (s, max) => String(s ?? '').slice(0, max);
try {
  const theme = require('../../utils/theme');
  COLORS = theme.COLORS ?? COLORS;
  applyFooter = theme.applyFooter ?? applyFooter;
  truncate = theme.truncate ?? truncate;
} catch { /* fallback inline sopra */ }

/** Timestamp unix sicuro da un evento (scheduledStartTimestamp può essere null). */
function eventTs(e) {
  const ts = Math.floor(Number(e?.scheduledStartTimestamp) / 1000);
  return Number.isFinite(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000);
}

/**
 * Parsea 'GG/MM/AAAA HH:MM' (ora locale del server/bot).
 * @returns {{ ok: true, date: Date } | { ok: false, error: string }}
 */
function parseDataEvento(input) {
  const s = String(input || '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) {
    return { ok: false, error: 'Formato non valido: usa `GG/MM/AAAA HH:MM` (es. `25/12/2026 18:30`).' };
  }
  const [, gg, mm, aaaa, hh, min] = m.map(Number);
  if (mm < 1 || mm > 12 || hh > 23 || min > 59) {
    return { ok: false, error: 'Data non valida: controlla giorno, mese e ora.' };
  }
  const date = new Date(aaaa, mm - 1, gg, hh, min, 0, 0);
  // Round-trip: rifiuta date impossibili (es. 31/02).
  if (date.getFullYear() !== aaaa || date.getMonth() !== mm - 1 || date.getDate() !== gg) {
    return { ok: false, error: 'Data inesistente (es. 31/02 non esiste).' };
  }
  const now = Date.now();
  if (date.getTime() <= now) {
    return { ok: false, error: 'La data deve essere nel futuro.' };
  }
  if (date.getTime() - now > ONE_YEAR_MS) {
    return { ok: false, error: 'La data è troppo lontana: max 1 anno da oggi.' };
  }
  return { ok: true, date };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Gestisci gli eventi programmati del server')
    .addSubcommand((s) =>
      s
        .setName('crea')
        .setDescription('Crea un evento programmato')
        .addStringOption((o) => o.setName('nome').setDescription('Titolo evento').setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName('data-ora').setDescription('Quando: GG/MM/AAAA HH:MM (es. 25/12/2026 18:30)').setRequired(true))
        .addStringOption((o) => o.setName('descrizione').setDescription('Dettagli evento').setRequired(false).setMaxLength(1000))
        .addChannelOption((o) =>
          o.setName('canale-vocale').setDescription('Vocale dove si svolge (vuoto = evento esterno)').addChannelTypes(ChannelType.GuildVoice).setRequired(false)
        )
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra gli eventi programmati'))
    .addSubcommand((s) =>
      s
        .setName('elimina')
        .setDescription('Elimina un evento programmato')
        .addStringOption((o) => o.setName('id').setDescription('ID evento (vedi /evento lista)').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
  cooldown: 5,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'crea') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents)) {
        return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Eventi**.', flags: MessageFlags.Ephemeral });
      }
      // BUGFIX: precheck permessi bot prima della chiamata API (errore chiaro subito).
      if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageEvents)) {
        return interaction.reply({ content: '❌ Non ho il permesso **Gestisci Eventi**: dammelo e riprova.', flags: MessageFlags.Ephemeral });
      }
      const nome = interaction.options.getString('nome', true).trim();
      const dataRaw = interaction.options.getString('data-ora', true);
      const descrizione = interaction.options.getString('descrizione')?.trim().slice(0, 1000) || null;
      const voice = interaction.options.getChannel('canale-vocale');

      const parsed = parseDataEvento(dataRaw);
      if (!parsed.ok) {
        return interaction.reply({ content: `❌ ${parsed.error}`, flags: MessageFlags.Ephemeral });
      }
      const start = parsed.date;
      const end = new Date(start.getTime() + 3600 * 1000); // +1h (obbligatoria per eventi esterni)

      try {
        const event = await interaction.guild.scheduledEvents.create({
          name: nome.slice(0, 100),
          scheduledStartTime: start,
          scheduledEndTime: end,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
          ...(voice
            ? {
                entityType: GuildScheduledEventEntityType.Voice,
                channel: voice.id,
              }
            : {
                entityType: GuildScheduledEventEntityType.External,
                entityMetadata: { location: 'Online / vedi descrizione' },
              }),
          ...(descrizione ? { description: descrizione } : {}),
          reason: `Evento creato da ${interaction.user.tag}`,
        });

        const embed = applyFooter(
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(truncate(`📅 ${event.name}`, 256))
            .setDescription(
              `🎉 **Nuovo evento in arrivo!**\n\n${descrizione ? `📝 ${truncate(descrizione, 900)}\n\n` : ''}🕒 Inizio: <t:${Math.floor(start.getTime() / 1000)}:F> (<t:${Math.floor(start.getTime() / 1000)}:R>)\n` +
                `${voice ? `🔊 Canale: ${voice}\n` : '🌐 Tipo: esterno 🌍\n'}` +
                `🔗 [Apri evento e metti "Mi interessa"!](${event.url})`
            )
            .setFooter({ text: truncate(`ID: ${event.id} • Creato da ${interaction.user.tag}`, 200) }),
          interaction
        );
        return interaction.reply({ embeds: [embed] });
      } catch (e) {
        console.error('evento crea:', e.message);
        return interaction.reply({
          content: '❌ Non sono riuscito a creare l\u2019evento (controlla i miei permessi e riprova).',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (sub === 'lista') {
      const events = await interaction.guild.scheduledEvents.fetch().catch(() => null);
      if (!events) {
        return interaction.reply({ content: '❌ Non riesco a leggere gli eventi del server.', flags: MessageFlags.Ephemeral });
      }
      if (events.size === 0) {
        return interaction.reply('📅 Nessun evento programmato. Creane uno con `/evento crea`.');
      }
      const sorted = [...events.values()].sort((a, b) => (a.scheduledStartTimestamp ?? Infinity) - (b.scheduledStartTimestamp ?? Infinity)).slice(0, 10);
      const embed = applyFooter(
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(truncate(`📅 Eventi programmati (${events.size})`, 256))
          .setDescription(
            truncate(
              `✨ **${events.size} eventi in programma** — non mancare!\n\n` +
              sorted
                .map((e) => {
                  const ts = eventTs(e);
                  return `🎪 **${truncate(e.name, 100)}**${e.userCount ? ` (👥 ${e.userCount} interessati)` : ''}\n🕒 <t:${ts}:F> (<t:${ts}:R>)\n🆔 \`${e.id}\` • [Apri](${e.url})`;
                })
                .join('\n\n'),
              3900
            )
          )
          .setFooter({ text: truncate(events.size > 10 ? `Mostrati 10 di ${events.size} eventi` : interaction.guild.name, 200) }),
        interaction
      );
      return interaction.reply({ embeds: [embed] });
    }

    // sub === 'elimina'
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Eventi**.', flags: MessageFlags.Ephemeral });
    }
    // BUGFIX: precheck permessi bot prima della chiamata API (errore chiaro subito).
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageEvents)) {
      return interaction.reply({ content: '❌ Non ho il permesso **Gestisci Eventi**: dammelo e riprova.', flags: MessageFlags.Ephemeral });
    }
    const id = interaction.options.getString('id', true).trim();
    const target = await interaction.guild.scheduledEvents.fetch(id).catch(() => null);
    if (!target) {
      return interaction.reply({ content: '❌ Evento non trovato: controlla l\u2019ID con `/evento lista`.', flags: MessageFlags.Ephemeral });
    }
    try {
      await target.delete('Eliminato via /evento elimina');
      return interaction.reply(`🗑️ Evento **${target.name}** eliminato.`);
    } catch (e) {
      console.error('evento elimina:', e.message);
      return interaction.reply({ content: '❌ Non sono riuscito a eliminare l\u2019evento.', flags: MessageFlags.Ephemeral });
    }
  },
  // Export per test senza Discord.
  parseDataEvento,
};
