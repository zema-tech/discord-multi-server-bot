const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, MessageFlags,
} = require('discord.js');
const { getConfig, setConfig, getTicket, getStats } = require('../../database/tickets');
const { isSupport, sendPanel, doClose, typeLabel, ticketButtons } = require('../../handlers/ticketHandler');
const { buildTranscript } = require('../../utils/transcript');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c };
const ok = theme?.ok ?? ((t, d) =>
  new EmbedBuilder().setColor(COLORS.success).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp()
);
const info = theme?.info ?? ((t, d, c = COLORS.primary) =>
  new EmbedBuilder().setColor(c ?? COLORS.primary).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp()
);
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const applyFooter = theme?.applyFooter ?? ((e) => e);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

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
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    // ---- SETUP (solo staff gestione server) ----
    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
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
        return interaction.reply({ embeds: [themeErr('Non riesco a scrivere nel canale panel. Verifica i permessi.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        embeds: [applyFooter(ok('✅ Ticket configurati', `📌 Panel: ${panelCh}\n📁 Categoria: **${truncate(category.name, 100)}**\n🛠️ Staff: ${role}${role2 ? ` + ${role2}` : ''}\n📝 Log: ${logCh || '—'}\n👤 Max per utente: **${max}**`), interaction)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ---- PANEL ----
    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      const ch = interaction.guild.channels.cache.get(config.panelChannelId) ?? await interaction.guild.channels.fetch(config.panelChannelId).catch(() => null);
      if (!ch?.isTextBased?.()) return interaction.reply({ embeds: [themeErr('Canale panel non configurato. Usa `/ticket setup`.')], flags: MessageFlags.Ephemeral });
      try {
        await sendPanel(ch);
      } catch {
        return interaction.reply({ embeds: [themeErr('Non riesco a scrivere nel canale panel. Verifica i permessi.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [applyFooter(ok('✅ Pannello ripubblicato', `Pannello ripubblicato in ${ch}.`), interaction)], flags: MessageFlags.Ephemeral });
    }

    // ---- STATS ----
    if (sub === 'stats') {
      const st = getStats(interaction.guild.id);
      const byType = truncate(Object.entries(st.byType).map(([k, v]) => `${typeLabel(k)}: **${v}**`).join('\n') || '—', 1024);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🎫 Statistiche ticket — ${truncate(interaction.guild.name, 100)}`.slice(0, 256))
        .setTimestamp();
      embed.addFields(
        { name: '📂 Aperti', value: `${st.open}`, inline: true },
        { name: '🔒 Chiusi', value: `${st.closed}`, inline: true },
        { name: '📊 Totali', value: `${st.total}`, inline: true },
        { name: 'Per tipo', value: byType }
      );
      applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed] });
    }

    // ---- Sotto-comandi dentro un ticket ----
    const ticket = getTicket(interaction.guild.id, interaction.channelId);
    if (!ticket) {
      return interaction.reply({ embeds: [themeErr('Usa questo sotto-comando dentro un canale ticket.')], flags: MessageFlags.Ephemeral });
    }
    const staff = isSupport(interaction.member, config);

    if (sub === 'aggiungi' || sub === 'rimuovi') {
      const user = interaction.options.getUser('utente');
      if (!user) return interaction.reply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ embeds: [themeErr('Solo il proprietario o lo staff.')], flags: MessageFlags.Ephemeral });
      if (user.id === ticket.ownerId) return interaction.reply({ embeds: [themeErr('È il proprietario del ticket.')], flags: MessageFlags.Ephemeral });
      try {
        if (sub === 'aggiungi') {
          await interaction.channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
          });
          return interaction.reply({ embeds: [applyFooter(ok('✅ Utente aggiunto', `${user} aggiunto al ticket #${ticket.number}.`), interaction)] });
        }
        await interaction.channel.permissionOverwrites.delete(user.id);
        return interaction.reply({ embeds: [applyFooter(ok('✅ Utente rimosso', `${user} rimosso dal ticket #${ticket.number}.`), interaction)] });
      } catch {
        return interaction.reply({ embeds: [themeErr('Errore permessi canale.')], flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'claim') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'open') return interaction.reply({ embeds: [themeErr('Ticket già chiuso.')], flags: MessageFlags.Ephemeral });
      const { saveTicket } = require('../../database/tickets');
      ticket.claimedBy = ticket.claimedBy === interaction.user.id ? null : interaction.user.id;
      saveTicket(interaction.guild.id, ticket);
      return interaction.reply({
        embeds: [applyFooter(ok('🖐️ Presa in carico', ticket.claimedBy ? `Ticket #${ticket.number} preso in carico da ${interaction.user}!` : `${interaction.user} ha rilasciato il ticket #${ticket.number}.`), interaction)],
      });
    }

    if (sub === 'chiudi') {
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ embeds: [themeErr('Solo il proprietario o lo staff.')], flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'open') return interaction.reply({ embeds: [themeErr('Ticket già chiuso.')], flags: MessageFlags.Ephemeral });
      const reason = (interaction.options.getString('motivo') || 'Chiuso via comando').slice(0, 500);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!interaction.deferred && !interaction.replied) {
        return;
      }
      let closed = false;
      try {
        closed = await doClose(interaction.channel, interaction.guild, ticket, interaction.user, reason);
      } catch {
        return interaction.editReply({ embeds: [themeErr('Errore durante la chiusura del ticket.')] }).catch(() => {});
      }
      return interaction.editReply(closed ? { embeds: [ok('✅ Ticket chiuso', 'Transcript inviato nei log e al proprietario.')] } : { embeds: [themeErr('Ticket già chiuso.')] }).catch(() => {});
    }

    if (sub === 'riapri') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'closed') return interaction.reply({ embeds: [themeErr('Il ticket è già aperto.')], flags: MessageFlags.Ephemeral });
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
      return interaction.reply({ embeds: [applyFooter(ok('🔓 Ticket riaperto', `Ticket **#${ticket.number}** riaperto.`), interaction)], components: ticketButtons(false) });
    }

    if (sub === 'transcript') {
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ embeds: [themeErr('Non hai accesso.')], flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!interaction.deferred && !interaction.replied) {
        return;
      }
      let file = null;
      try {
        file = await buildTranscript(interaction.channel);
      } catch {
        return interaction.editReply({ embeds: [themeErr('Errore nella generazione del transcript.')] }).catch(() => {});
      }
      if (!file) {
        return interaction.editReply({ embeds: [themeErr('Errore nella generazione del transcript.')] }).catch(() => {});
      }
      return interaction.editReply({ content: `📝 Transcript del ticket #${ticket.number}:`, files: [file] }).catch(() => {});
    }
  },
};
