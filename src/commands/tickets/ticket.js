const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, MessageFlags,
} = require('discord.js');
const { getConfig, setConfig, getTicket, getStats } = require('../../database/tickets');
const { isSupport, sendPanel, doClose, typeLabel, ticketButtons } = require('../../handlers/ticketHandler');
const { buildTranscript } = require('../../utils/transcript');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Sistema ticket professionale')
    .addSubcommand((s) =>
      s.setName('setup').setDescription('Configura il sistema ticket (categoria, panel, log, ruoli)')
        .addChannelOption((o) => o.setName('canale-panel').setDescription('Dove pubblicare il pannello').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addChannelOption((o) => o.setName('categoria').setDescription('Categoria dove creare i ticket').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
        .addRoleOption((o) => o.setName('ruolo-supporto').setDescription('Ruolo staff ticket').setRequired(true))
        .addChannelOption((o) => o.setName('canale-log').setDescription('Dove inviare transcript e chiusure').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption((o) => o.setName('ruolo-supporto-2').setDescription('Secondo ruolo staff (opzionale)').setRequired(false))
        .addIntegerOption((o) => o.setName('max-per-utente').setDescription('Max ticket aperti per utente (default 3)').setMinValue(1).setMaxValue(10).setRequired(false))
    )
    .addSubcommand((s) => s.setName('panel').setDescription('Ripubblica il pannello ticket'))
    .addSubcommand((s) =>
      s.setName('aggiungi').setDescription('Aggiungi un utente al ticket')
        .addUserOption((o) => o.setName('utente').setDescription('Utente da aggiungere').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi un utente dal ticket')
        .addUserOption((o) => o.setName('utente').setDescription('Utente da rimuovere').setRequired(true))
    )
    .addSubcommand((s) => s.setName('claim').setDescription('Prendi in carico questo ticket (staff)'))
    .addSubcommand((s) =>
      s.setName('chiudi').setDescription('Chiudi questo ticket con transcript')
        .addStringOption((o) => o.setName('motivo').setDescription('Motivo della chiusura').setRequired(false))
    )
    .addSubcommand((s) => s.setName('riapri').setDescription('Riapri questo ticket (staff)'))
    .addSubcommand((s) => s.setName('transcript').setDescription('Scarica il transcript di questo ticket'))
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiche dei ticket del server')),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    // ---- SETUP (solo staff gestione server) ----
    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral });
      }
      const panelCh = interaction.options.getChannel('canale-panel');
      const category = interaction.options.getChannel('categoria');
      const role = interaction.options.getRole('ruolo-supporto');
      const role2 = interaction.options.getRole('ruolo-supporto-2');
      const logCh = interaction.options.getChannel('canale-log');
      const max = interaction.options.getInteger('max-per-utente') ?? 3;

      const supportRoleIds = [role.id, ...(role2 ? [role2.id] : [])];
      setConfig(interaction.guild.id, {
        panelChannelId: panelCh.id,
        categoryId: category.id,
        logChannelId: logCh ? logCh.id : null,
        supportRoleIds,
        maxPerUser: max,
      });

      try {
        await sendPanel(panelCh);
      } catch {
        return interaction.reply({ content: '❌ Non riesco a scrivere nel canale panel. Verifica i permessi.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: `✅ **Ticket configurati!**\n📌 Panel: ${panelCh}\n📁 Categoria: **${category.name}**\n🛠️ Staff: ${role}${role2 ? ` + ${role2}` : ''}\n📝 Log: ${logCh || '—'}\n👤 Max per utente: **${max}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---- PANEL ----
    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral });
      }
      const ch = interaction.guild.channels.cache.get(config.panelChannelId) ?? await interaction.guild.channels.fetch(config.panelChannelId).catch(() => null);
      if (!ch?.isTextBased?.()) return interaction.reply({ content: '❌ Canale panel non configurato. Usa `/ticket setup`.', flags: MessageFlags.Ephemeral });
      await sendPanel(ch);
      return interaction.reply({ content: `✅ Pannello ripubblicato in ${ch}.`, flags: MessageFlags.Ephemeral });
    }

    // ---- STATS ----
    if (sub === 'stats') {
      const st = getStats(interaction.guild.id);
      const byType = Object.entries(st.byType).map(([k, v]) => `${typeLabel(k)}: **${v}**`).join('\n') || '—';
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎫 Statistiche ticket — ${interaction.guild.name}`)
        .addFields(
          { name: '📂 Aperti', value: `${st.open}`, inline: true },
          { name: '🔒 Chiusi', value: `${st.closed}`, inline: true },
          { name: '📊 Totali', value: `${st.total}`, inline: true },
          { name: 'Per tipo', value: byType }
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ---- Sotto-comandi dentro un ticket ----
    const ticket = getTicket(interaction.guild.id, interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: '❌ Usa questo sotto-comando dentro un canale ticket.', flags: MessageFlags.Ephemeral });
    }
    const staff = isSupport(interaction.member, config);

    if (sub === 'aggiungi' || sub === 'rimuovi') {
      const user = interaction.options.getUser('utente');
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ content: '❌ Solo il proprietario o lo staff.', flags: MessageFlags.Ephemeral });
      if (user.id === ticket.ownerId) return interaction.reply({ content: '❌ È il proprietario del ticket.', flags: MessageFlags.Ephemeral });
      try {
        if (sub === 'aggiungi') {
          await interaction.channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
          });
          return interaction.reply(`✅ ${user} aggiunto al ticket #${ticket.number}.`);
        }
        await interaction.channel.permissionOverwrites.delete(user.id);
        return interaction.reply(`✅ ${user} rimosso dal ticket #${ticket.number}.`);
      } catch {
        return interaction.reply({ content: '❌ Errore permessi canale.', flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'claim') {
      if (!staff) return interaction.reply({ content: '❌ Solo lo staff.', flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'open') return interaction.reply({ content: '❌ Ticket già chiuso.', flags: MessageFlags.Ephemeral });
      const { saveTicket } = require('../../database/tickets');
      ticket.claimedBy = ticket.claimedBy === interaction.user.id ? null : interaction.user.id;
      saveTicket(interaction.guild.id, ticket);
      return interaction.reply(
        ticket.claimedBy ? `🖐️ Ticket #${ticket.number} preso in carico da ${interaction.user}!` : `🖐️ ${interaction.user} ha rilasciato il ticket #${ticket.number}.`
      );
    }

    if (sub === 'chiudi') {
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ content: '❌ Solo il proprietario o lo staff.', flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'open') return interaction.reply({ content: '❌ Ticket già chiuso.', flags: MessageFlags.Ephemeral });
      const reason = (interaction.options.getString('motivo') || 'Chiuso via comando').slice(0, 500);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!interaction.deferred && !interaction.replied) {
        return;
      }
      let closed = false;
      try {
        closed = await doClose(interaction.channel, interaction.guild, ticket, interaction.user, reason);
      } catch {
        return interaction.editReply('❌ Errore durante la chiusura del ticket.').catch(() => {});
      }
      return interaction.editReply(closed ? '✅ Ticket chiuso, transcript inviato nei log e al proprietario.' : '❌ Ticket già chiuso.').catch(() => {});
    }

    if (sub === 'riapri') {
      if (!staff) return interaction.reply({ content: '❌ Solo lo staff.', flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'closed') return interaction.reply({ content: '❌ Il ticket è già aperto.', flags: MessageFlags.Ephemeral });
      const { saveTicket } = require('../../database/tickets');
      ticket.status = 'open';
      ticket.closedAt = null;
      saveTicket(interaction.guild.id, ticket);
      try {
        await interaction.channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: true });
        if (interaction.channel.name.startsWith('closed-')) {
          await interaction.channel.setName(interaction.channel.name.replace(/^closed-/, '').slice(0, 100));
        }
      } catch {}
      return interaction.reply({ content: `🔓 Ticket **#${ticket.number}** riaperto.`, components: ticketButtons(false) });
    }

    if (sub === 'transcript') {
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ content: '❌ Non hai accesso.', flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!interaction.deferred && !interaction.replied) {
        return;
      }
      try {
        const file = await buildTranscript(interaction.channel);
        return interaction.editReply({ content: `📝 Transcript del ticket #${ticket.number}:`, files: [file] }).catch(() => {});
      } catch {
        return interaction.editReply('❌ Errore nella generazione del transcript.').catch(() => {});
      }
    }
  },
};
