const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
} = require('discord.js');
const {
  MAX_PER_USER, saveRoom, getRoom, removeRoom, getUserRooms,
} = require('../../database/stanze');

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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ---- CREA ----
    if (sub === 'crea') {
      const lockKey = `${guildId}:${interaction.user.id}`;
      if (creatingRooms.has(lockKey)) {
        return interaction.reply({ content: '⏳ Creazione della stanza già in corso, attendi…', flags: MessageFlags.Ephemeral });
      }
      const mie = getUserRooms(guildId, interaction.user.id);
      if (mie.length >= MAX_PER_USER) {
        return interaction.reply({
          content: `❌ Hai già **${MAX_PER_USER}** stanze attive. Elimina una stanza prima di crearne una nuova.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      creatingRooms.add(lockKey);
      try {
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
            content: `✅ Stanza ${tipo === 'vocale' ? 'vocale' : 'testuale'} creata: ${channel} (solo tu e lo staff possono vederla).`,
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          return interaction.reply({ content: '❌ Non riesco a creare la stanza. Verifica i miei permessi.', flags: MessageFlags.Ephemeral });
        }
      } finally {
        creatingRooms.delete(lockKey);
      }
    }

    // ---- Sotto-comandi dentro una stanza ----
    const room = getRoom(guildId, interaction.channelId);
    if (!room) {
      return interaction.reply({ content: '❌ Usa questo sotto-comando dentro una **stanza** creata con `/stanza crea`.', flags: MessageFlags.Ephemeral });
    }
    const allowed = room.ownerId === interaction.user.id || isStaff(interaction.member);
    if (!allowed) {
      return interaction.reply({ content: '❌ Solo il **proprietario** della stanza o lo staff.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'aggiungi' || sub === 'rimuovi') {
      const user = interaction.options.getUser('utente', true);
      if (user.id === room.ownerId) {
        return interaction.reply({ content: '❌ È il proprietario della stanza.', flags: MessageFlags.Ephemeral });
      }
      if (user.bot) {
        return interaction.reply({ content: '❌ Non puoi aggiungere un bot.', flags: MessageFlags.Ephemeral });
      }
      try {
        if (sub === 'aggiungi') {
          await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true }, { reason: `Aggiunto da ${interaction.user.tag}` });
          return interaction.reply(`✅ ${user} aggiunto alla stanza.`);
        }
        await interaction.channel.permissionOverwrites.delete(user.id, `Rimosso da ${interaction.user.tag}`);
        return interaction.reply(`✅ ${user} rimosso dalla stanza.`);
      } catch {
        return interaction.reply({ content: '❌ Errore permessi canale.', flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'elimina') {
      try {
        await interaction.reply({ content: '🗑️ Stanza in eliminazione…', flags: MessageFlags.Ephemeral });
        await interaction.channel.delete(`Stanza eliminata da ${interaction.user.tag}`);
      } catch {
        // La prima reply potrebbe essere già partita: mai doppia reply (lancia InteractionAlreadyReplied).
        if (interaction.replied || interaction.deferred) {
          return interaction.followUp({ content: '❌ Non riesco a eliminare la stanza.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return interaction.reply({ content: '❌ Non riesco a eliminare la stanza.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      removeRoom(guildId, interaction.channelId);
    }
  },
};
