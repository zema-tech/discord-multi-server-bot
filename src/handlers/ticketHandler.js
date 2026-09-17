const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const {
  TICKET_TYPES, getConfig, nextNumber, saveTicket, getTicket, getUserOpenTickets,
} = require('../database/tickets');
const { getGuild } = require('../database/guildConfig');
const { buildTranscript } = require('../utils/transcript');

function isSupport(member, config) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  return (config.supportRoleIds || []).some((id) => member.roles?.cache?.has(id));
}

function typeLabel(key) {
  const t = TICKET_TYPES[key];
  return t ? `${t.emoji} ${t.label}` : key;
}

// ---------- Pannello ----------

function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 Centro Assistenza')
    .setDescription(
      'Hai bisogno di aiuto? Seleziona il tipo di richiesta dal menu qui sotto e si aprirà un ticket privato con lo staff.\n\n' +
      Object.entries(TICKET_TYPES).map(([k, t]) => `${t.emoji} **${t.label}** — ${t.descrizione}`).join('\n') +
      '\n\n⚠️ Non aprire ticket per scherzo: è punibile.'
    )
    .setFooter({ text: 'Lo staff ti risponderà il prima possibile' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_create')
    .setPlaceholder('Seleziona il tipo di ticket…')
    .addOptions(
      Object.entries(TICKET_TYPES).map(([key, t]) => ({
        label: t.label.slice(0, 100),
        description: t.descrizione.slice(0, 100),
        value: key,
        emoji: t.emoji,
      }))
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

async function sendPanel(channel) {
  return channel.send(buildPanel());
}

// ---------- Creazione ticket ----------

// Lock anti-race: una sola creazione alla volta per utente (doppi click sul select).
const creatingTickets = new Set();

function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 20) || 'utente';
}

function ticketButtons(closed = false) {
  if (closed) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Riapri').setEmoji('🔓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('Elimina').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
      ),
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Prendi in carico').setEmoji('🖐️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Chiudi').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function createTicket(interaction, typeKey) {
  const { guild } = interaction;
  const lockKey = `${guild.id}:${interaction.user.id}`;
  if (creatingTickets.has(lockKey)) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⏳ Creazione del ticket già in corso, attendi…', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }
  creatingTickets.add(lockKey);
  try {
    await createTicketInner(interaction, typeKey);
  } finally {
    creatingTickets.delete(lockKey);
  }
}

async function createTicketInner(interaction, typeKey) {
  const { guild } = interaction;
  const config = getConfig(guild.id);

  if (!TICKET_TYPES[typeKey]) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Tipo di ticket non valido.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }
  if (!config.categoryId) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Ticket non configurati. Uno staffer deve usare `/ticket setup`.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }
  const open = getUserOpenTickets(guild.id, interaction.user.id);
  if (open.length >= (config.maxPerUser || 3)) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `❌ Hai già **${open.length}** ticket aperti (max ${config.maxPerUser}). Chiudine uno prima di aprirne un altro.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
    return;
  }

  const category = await guild.channels.fetch(config.categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Categoria ticket non trovata. Riesegui `/ticket setup`.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const number = nextNumber(guild.id);
  const name = `ticket-${safeName(interaction.user.username)}-${String(number).padStart(4, '0')}`;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
    },
  ];
  const supportRoleIds = (config.supportRoleIds || []).filter((id) => guild.roles.cache.has(id));
  for (const roleId of supportRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket #${number} | owner ${interaction.user.id} | tipo ${typeKey}`,
      permissionOverwrites: overwrites,
      reason: `Ticket #${number} aperto da ${interaction.user.tag}`,
    });
  } catch (e) {
    console.error('createTicket:', e);
    return interaction.editReply('❌ Impossibile creare il canale. Verifica i miei permessi (Gestisci Canali).');
  }

  saveTicket(guild.id, {
    channelId: channel.id,
    ownerId: interaction.user.id,
    type: typeKey,
    number,
    status: 'open',
    claimedBy: null,
    createdAt: Date.now(),
    closedAt: null,
    closeReason: null,
  });

  const supportPing = supportRoleIds.map((id) => `<@&${id}>`).join(' ');
  const welcome = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${TICKET_TYPES[typeKey].emoji} Ticket #${number} — ${TICKET_TYPES[typeKey].label}`)
    .setDescription(`Ciao ${interaction.user}! Descrivi la tua richiesta: lo staff ti risponderà qui.\n\n**Proprietario:** ${interaction.user}\n**Tipo:** ${typeLabel(typeKey)}`)
    .setFooter({ text: `Ticket #${number} • Usa i pulsanti qui sotto per gestirlo` })
    .setTimestamp();

  await channel.send({ content: `${interaction.user} ${supportPing}`, embeds: [welcome], components: ticketButtons(false) });
  await interaction.editReply(`✅ Ticket creato: ${channel}`);
}

// ---------- Chiusura ----------

async function resolveLogChannel(guild) {
  const tCfg = getConfig(guild.id);
  const id = tCfg.logChannelId || getGuild(guild.id).logChannelId;
  if (!id) return null;
  return guild.channels.fetch(id).catch(() => null);
}

async function doClose(channel, guild, ticket, closedBy, reason) {
  // Guard atomica: il claim dello stato avviene qui in modo sincrono, così una
  // doppia chiusura concorrente (bottone + comando + autoclose) diventa no-op.
  if (!ticket || ticket.status !== 'open') return false;
  ticket.status = 'closed';
  ticket.closedAt = Date.now();
  ticket.closeReason = reason || 'Nessun motivo';
  ticket.closedBy = closedBy.id;
  saveTicket(guild.id, ticket);

  const owner = await guild.members.fetch(ticket.ownerId).catch(() => null);
  const ownerTag = owner ? owner.user.tag : `ID ${ticket.ownerId}`;

  let transcript = null;
  try {
    transcript = await buildTranscript(channel);
  } catch (e) {
    console.error('transcript:', e.message);
  }

  // Blocca il canale e rinominalo
  try {
    if (owner) {
      await channel.permissionOverwrites.edit(owner.id, { SendMessages: false });
    }
    if (!channel.name.startsWith('closed-')) {
      await channel.setName(`closed-${channel.name}`.slice(0, 100));
    }
  } catch (e) {
    console.error('close lock:', e.message);
  }

  const duration = Math.max(1, Math.round((Date.now() - ticket.createdAt) / 60000));
  const claimer = ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—';

  const closedEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`🔒 Ticket #${ticket.number} chiuso`)
    .addFields(
      { name: 'Proprietario', value: `${ownerTag}`, inline: true },
      { name: 'Chiuso da', value: `${closedBy.tag}`, inline: true },
      { name: 'Motivo', value: (reason || 'Nessun motivo').slice(0, 1024) },
      { name: 'Preso in carico da', value: claimer, inline: true },
      { name: 'Durata', value: `${duration} min`, inline: true }
    )
    .setTimestamp();
  await channel.send({ embeds: [closedEmbed], components: ticketButtons(true) }).catch(() => {});

  // Log + DM al proprietario
  const logEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📝 Ticket #${ticket.number} chiuso — ${typeLabel(ticket.type)}`)
    .addFields(
      { name: 'Proprietario', value: `${ownerTag} (<@${ticket.ownerId}>)`, inline: true },
      { name: 'Chiuso da', value: `${closedBy.tag}`, inline: true },
      { name: 'Motivo', value: (reason || 'Nessun motivo').slice(0, 1024) }
    )
    .setTimestamp();
  const logCh = await resolveLogChannel(guild);
  if (logCh?.isTextBased()) {
    await logCh.send({ embeds: [logEmbed], files: transcript ? [transcript] : [] }).catch(() => {});
  }
  if (owner) {
    await owner.send({ content: `🔒 Il tuo ticket **#${ticket.number}** (${typeLabel(ticket.type)}) è stato chiuso da **${closedBy.tag}**. Motivo: ${reason || 'Nessun motivo'}`, files: transcript ? [transcript] : [] }).catch(() => {});
  }
  return true;
}

// ---------- Handler interazioni ----------

async function requireTicket(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return null;
  }
  const ticket = getTicket(interaction.guild.id, interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: '❌ Questo comando funziona solo dentro un canale ticket.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return null;
  }
  return ticket;
}

async function handle(interaction) {
  const { guild } = interaction;
  if (!guild) return false;

  // --- Select: creazione ticket ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_create') {
    const chosen = interaction.values?.[0];
    if (!chosen) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Selezione non valida.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return true;
    }
    await createTicket(interaction, chosen);
    return true;
  }

  // --- Modale: motivo chiusura ---
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_modal') {
    const ticket = getTicket(guild.id, interaction.channelId);
    if (!ticket || ticket.status !== 'open') {
      await interaction.reply({ content: '❌ Ticket non valido o già chiuso.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const config = getConfig(guild.id);
    const allowed = ticket.ownerId === interaction.user.id || isSupport(interaction.member, config);
    if (!allowed) {
      await interaction.reply({ content: '❌ Solo il proprietario o lo staff possono chiudere il ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const reason = interaction.fields.getTextInputValue('reason');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const closed = await doClose(interaction.channel, guild, ticket, interaction.user, reason);
    await interaction.editReply(closed ? '✅ Ticket chiuso, transcript inviato nei log e al proprietario.' : '❌ Ticket già chiuso.');
    return true;
  }

  if (!interaction.isButton()) return false;
  const id = interaction.customId;
  if (!id.startsWith('ticket_')) return false;

  const config = getConfig(guild.id);

  if (id === 'ticket_claim') {
    const ticket = await requireTicket(interaction);
    if (!ticket) return true;
    if (!isSupport(interaction.member, config)) {
      await interaction.reply({ content: '❌ Solo lo staff può prendere in carico i ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ticket.status !== 'open') {
      await interaction.reply({ content: '❌ Ticket già chiuso.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ticket.claimedBy === interaction.user.id) {
      ticket.claimedBy = null;
      saveTicket(guild.id, ticket);
      await interaction.reply(`🖐️ ${interaction.user} ha **rilasciato** il ticket #${ticket.number}.`);
    } else {
      ticket.claimedBy = interaction.user.id;
      saveTicket(guild.id, ticket);
      await interaction.reply(`🖐️ Ticket #${ticket.number} preso in carico da ${interaction.user}!`);
    }
    return true;
  }

  if (id === 'ticket_close') {
    const ticket = await requireTicket(interaction);
    if (!ticket) return true;
    const allowed = ticket.ownerId === interaction.user.id || isSupport(interaction.member, config);
    if (!allowed) {
      await interaction.reply({ content: '❌ Solo il proprietario o lo staff possono chiudere il ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ticket.status !== 'open') {
      await interaction.reply({ content: '❌ Ticket già chiuso.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('Conferma chiusura').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('Annulla').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ content: `🔒 Chiudere il ticket **#${ticket.number}**? Verrà generato il transcript.`, components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === 'ticket_cancel_close') {
    try {
      await interaction.update({ content: '✅ Chiusura annullata.', components: [] });
    } catch {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '✅ Chiusura annullata.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return true;
  }

  if (id === 'ticket_confirm_close') {
    const ticket = getTicket(guild.id, interaction.channelId);
    if (!ticket || ticket.status !== 'open') {
      try {
        await interaction.update({ content: '❌ Ticket non valido o già chiuso.', components: [] });
      } catch {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ticket non valido o già chiuso.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
      return true;
    }
    const modal = new ModalBuilder().setCustomId('ticket_close_modal').setTitle('Chiudi ticket');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Motivo della chiusura').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
      )
    );
    try {
      await interaction.showModal(modal);
    } catch {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Impossibile aprire il modulo di chiusura. Riprova.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return true;
  }

  if (id === 'ticket_reopen') {
    const ticket = await requireTicket(interaction);
    if (!ticket) return true;
    if (!isSupport(interaction.member, config)) {
      await interaction.reply({ content: '❌ Solo lo staff può riaprire i ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ticket.status !== 'closed') {
      await interaction.reply({ content: '❌ Il ticket è già aperto.', flags: MessageFlags.Ephemeral });
      return true;
    }
    ticket.status = 'open';
    ticket.closedAt = null;
    saveTicket(guild.id, ticket);
    try {
      await interaction.channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: true });
      if (interaction.channel.name.startsWith('closed-')) {
        await interaction.channel.setName(interaction.channel.name.replace(/^closed-/, '').slice(0, 100));
      }
    } catch (e) {
      console.error('reopen:', e.message);
    }
    await interaction.reply({ content: `🔓 Ticket **#${ticket.number}** riaperto da ${interaction.user}.`, components: ticketButtons(false) });
    return true;
  }

  if (id === 'ticket_delete') {
    const ticket = await requireTicket(interaction);
    if (!ticket) return true;
    if (!isSupport(interaction.member, config)) {
      await interaction.reply({ content: '❌ Solo lo staff può eliminare i ticket.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply('🗑️ Canale in eliminazione tra 5 secondi…');
    setTimeout(() => interaction.channel?.delete(`Ticket #${ticket.number} eliminato da ${interaction.user.tag}`).catch(() => {}), 5000).unref?.();
    return true;
  }

  if (id === 'ticket_transcript') {
    const ticket = await requireTicket(interaction);
    if (!ticket) return true;
    const allowed = ticket.ownerId === interaction.user.id || isSupport(interaction.member, config);
    if (!allowed) {
      await interaction.reply({ content: '❌ Non hai accesso al transcript.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const file = await buildTranscript(interaction.channel);
      await interaction.editReply({ content: `📝 Transcript del ticket #${ticket.number}:`, files: [file] });
    } catch {
      await interaction.editReply('❌ Errore nella generazione del transcript.');
    }
    return true;
  }

  return false;
}

module.exports = { handle, isSupport, sendPanel, buildPanel, createTicket, doClose, typeLabel, requireTicket, ticketButtons };
