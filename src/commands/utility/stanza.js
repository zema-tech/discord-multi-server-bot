const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder,
} = require('discord.js');
const {
  MAX_PER_USER, saveRoom, getRoom, removeRoom, getUserRooms,
} = require('../../database/stanze');

// theme.js condiviso (fallback inline se il require fallisse).
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    ok: (t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    err: (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EmbedBuilder().setColor(c ?? 0x5865f2).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; },
  };
}
const { ok, err, info, applyFooter } = theme;

function isStaff(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
}

function staffRoles(guild) {
  return guild.roles.cache.filter(
    (r) => !r.managed && r.permissions.has(PermissionFlagsBits.ManageChannels)
  );
}

// Lock anti-race: una sola creazione alla volta per utente (oltre il cap con doppi comandi ravvicinati).
const creatingRooms = new Set();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stanza')
    .setDescription('Crea e gestisci le tue stanze private')
    .addSubcommand((s) =>
      s.setName('crea').setDescription('Crea una stanza privata (max 3 per utente)')
        .addStringOption((o) => o.setName('nome').setDescription('Nome della stanza').setMinLength(1).setMaxLength(100).setRequired(false))
        .addStringOption((o) => o.setName('tipo').setDescription('Tipo di canale').setRequired(false)
          .addChoices(
            { name: 'Testuale', value: 'testuale' },
            { name: 'Vocale', value: 'vocale' },
          ))
    )
    .addSubcommand((s) =>
      s.setName('aggiungi').setDescription('Aggiungi un utente alla stanza')
        .addUserOption((o) => o.setName('utente').setDescription('Utente da aggiungere').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi un utente dalla stanza')
        .addUserOption((o) => o.setName('utente').setDescription('Utente da rimuovere').setRequired(true))
    )
    .addSubcommand((s) => s.setName('elimina').setDescription('Elimina questa stanza')),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [applyFooter(err('Usa questo comando dentro un server.'), interaction)], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ---- CREA ----
    if (sub === 'crea') {
      const lockKey = `${guildId}:${interaction.user.id}`;
      if (creatingRooms.has(lockKey)) {
        return interaction.reply({ embeds: [applyFooter(info('⏳ Creazione in corso', 'Creazione della stanza già in corso, attendi…'), interaction)], flags: MessageFlags.Ephemeral });
      }
      creatingRooms.add(lockKey);
      try {
        const mie = getUserRooms(guildId, interaction.user.id);
        if (mie.length >= MAX_PER_USER) {
          return interaction.reply({
            embeds: [applyFooter(err(`Hai già **${MAX_PER_USER}** stanze attive. Elimina una stanza prima di crearne una nuova.`), interaction)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const tipo = interaction.options.getString('tipo') || 'testuale';
        const nome = (interaction.options.getString('nome') || `stanza-${interaction.user.username}`)
          .trim().slice(0, 100) || `stanza-${interaction.user.username}`;
        const channelType = tipo === 'vocale' ? ChannelType.GuildVoice : ChannelType.GuildText;

        const overwrites = [
          { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: tipo === 'vocale'
              ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
              : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ];
        for (const role of staffRoles(interaction.guild).values()) {
          overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] });
        }

        try {
          const channel = await interaction.guild.channels.create({
            name: nome,
            type: channelType,
            permissionOverwrites: overwrites,
            reason: `Stanza privata di ${interaction.user.tag}`,
          });
          saveRoom(guildId, channel.id, { ownerId: interaction.user.id, type: tipo });
          return interaction.reply({
            embeds: [applyFooter(ok('✅ Stanza creata', `Stanza ${tipo === 'vocale' ? 'vocale' : 'testuale'} creata: ${channel} (solo tu e lo staff possono vederla).`), interaction)],
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          return interaction.reply({ embeds: [applyFooter(err('Non riesco a creare la stanza. Verifica i miei permessi.'), interaction)], flags: MessageFlags.Ephemeral });
        }
      } finally {
        creatingRooms.delete(lockKey);
      }
    }

    // ---- Sotto-comandi dentro una stanza ----
    const room = getRoom(guildId, interaction.channelId);
    if (!room) {
      return interaction.reply({ embeds: [applyFooter(err('Usa questo sotto-comando dentro una **stanza** creata con `/stanza crea`.'), interaction)], flags: MessageFlags.Ephemeral });
    }
    // Owner registrato o staff: il DB fa fede (cap/owner), non il nome del canale.
    const allowed = room.ownerId === interaction.user.id || isStaff(interaction.member);
    if (!allowed) {
      return interaction.reply({ embeds: [applyFooter(err('Solo il **proprietario** della stanza o lo staff.'), interaction)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'aggiungi' || sub === 'rimuovi') {
      const user = interaction.options.getUser('utente', true);
      if (user.id === room.ownerId) {
        return interaction.reply({ embeds: [applyFooter(err('È il proprietario della stanza.'), interaction)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'aggiungi' && user.bot) {
        return interaction.reply({ embeds: [applyFooter(err('Non puoi aggiungere un bot.'), interaction)], flags: MessageFlags.Ephemeral });
      }
      try {
        if (sub === 'aggiungi') {
          // Testuale: servono anche SendMessages+ReadHistory, altrimenti l'invitato vede ma non scrive.
          const overwrites = room.type === 'vocale'
            ? { ViewChannel: true, Connect: true, Speak: true }
            : { ViewChannel: true, SendMessages: true, ReadMessageHistory: true };
          await interaction.channel.permissionOverwrites.edit(user.id, overwrites, { reason: `Aggiunto da ${interaction.user.tag}` });
          return interaction.reply({ embeds: [applyFooter(ok('✅ Utente aggiunto', `${user} aggiunto alla stanza.`), interaction)], flags: MessageFlags.Ephemeral });
        }
        await interaction.channel.permissionOverwrites.delete(user.id, `Rimosso da ${interaction.user.tag}`);
        return interaction.reply({ embeds: [applyFooter(ok('✅ Utente rimosso', `${user} rimosso dalla stanza.`), interaction)], flags: MessageFlags.Ephemeral });
      } catch {
        return interaction.reply({ embeds: [applyFooter(err('Errore permessi canale.'), interaction)], flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'elimina') {
      try {
        await interaction.reply({ embeds: [applyFooter(info('🗑️ Stanza in eliminazione', 'Elimino la stanza…'), interaction)], flags: MessageFlags.Ephemeral });
        await interaction.channel.delete(`Stanza eliminata da ${interaction.user.tag}`);
      } catch {
        // La prima reply potrebbe essere già partita: mai doppia reply (lancia InteractionAlreadyReplied).
        if (interaction.replied || interaction.deferred) {
          return interaction.followUp({ embeds: [applyFooter(err('Non riesco a eliminare la stanza.'), interaction)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return interaction.reply({ embeds: [applyFooter(err('Non riesco a eliminare la stanza.'), interaction)], flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      removeRoom(guildId, interaction.channelId);
    }
  },
};
