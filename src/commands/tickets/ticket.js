const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, MessageFlags,
} = require('discord.js');
const { getConfig, getTicket, getStats } = require('../../database/tickets');
const { isSupport, doClose, typeLabel, priorityLabel, ticketButtons } = require('../../handlers/ticketHandler');
const { buildTranscript } = require('../../utils/transcript');

function dashboardMsg(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const dest = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${dest} — sezione ${sezione}`;
}

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
    .addSubcommand((s) =>
      s.setName('priorita').setDescription('Imposta la priorità del ticket (staff)')
        .addStringOption((o) => o.setName('livello').setDescription('bassa/normale/alta/urgente').setRequired(true)
          .addChoices(
            { name: '🟢 Bassa', value: 'bassa' },
            { name: '🔵 Normale', value: 'normale' },
            { name: '🟠 Alta', value: 'alta' },
            { name: '🔴 Urgente', value: 'urgente' },
          ))
    )
    .addSubcommand((s) =>
      s.setName('assegna').setDescription('Assegna il ticket a uno staffer (staff)')
        .addUserOption((o) => o.setName('staff').setDescription('Staffer assegnatario').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('oggetto').setDescription('Imposta l’oggetto del ticket')
        .addStringOption((o) => o.setName('testo').setDescription('Oggetto (vuoto = rimuovi)').setRequired(false).setMaxLength(120))
    )
    .addSubcommand((s) =>
      s.setName('nota').setDescription('Aggiungi una nota staff al ticket (staff)')
        .addStringOption((o) => o.setName('testo').setDescription('Nota interna (max 500)').setRequired(true).setMaxLength(500))
    )
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiche dei ticket del server')),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const config = getConfig(interaction.guild.id);

    // ---- SETUP e PANEL: solo dalla dashboard ----
    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: dashboardMsg(interaction.guild.id, 'Ticket'), flags: MessageFlags.Ephemeral });
    }

    // ---- PANEL ----
    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: dashboardMsg(interaction.guild.id, 'Ticket'), flags: MessageFlags.Ephemeral });
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
      if (st.avgCloseMin !== null) {
        embed.addFields({ name: '⏱️ Chiusura media', value: `${st.avgCloseMin} min`, inline: true });
      }
      if (st.avgRating !== null) {
        embed.addFields({ name: '⭐ Valutazione media', value: `${st.avgRating}/5 (${st.ratingsCount} voti)`, inline: true });
      }
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

    if (sub === 'priorita') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'open') return interaction.reply({ embeds: [themeErr('Ticket già chiuso.')], flags: MessageFlags.Ephemeral });
      const livello = interaction.options.getString('livello', true);
      const { setPriority } = require('../../database/tickets');
      try {
        setPriority(interaction.guild.id, interaction.channelId, livello);
      } catch {
        return interaction.reply({ embeds: [themeErr('Priorità non valida.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [applyFooter(ok('⚡ Priorità aggiornata', `Ticket #${ticket.number}: ${priorityLabel(livello)}.`), interaction)] });
    }

    if (sub === 'assegna') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      if (ticket.status !== 'open') return interaction.reply({ embeds: [themeErr('Ticket già chiuso.')], flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('staff');
      if (!target || target.bot) return interaction.reply({ embeds: [themeErr('Staffer non valido.')], flags: MessageFlags.Ephemeral });
      const { saveTicket } = require('../../database/tickets');
      ticket.claimedBy = target.id;
      saveTicket(interaction.guild.id, ticket);
      return interaction.reply({ embeds: [applyFooter(ok('🖐️ Ticket assegnato', `Ticket #${ticket.number} assegnato a ${target}.`), interaction)] });
    }

    if (sub === 'oggetto') {
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ embeds: [themeErr('Solo il proprietario o lo staff.')], flags: MessageFlags.Ephemeral });
      const testo = (interaction.options.getString('testo') || '').trim();
      const { setSubject } = require('../../database/tickets');
      setSubject(interaction.guild.id, interaction.channelId, testo);
      try {
        const topic = `Ticket #${ticket.number} | owner ${ticket.ownerId} | tipo ${ticket.type}${testo ? ` | ${testo.slice(0, 80)}` : ''}`;
        await interaction.channel.setTopic(topic.slice(0, 1024)).catch(() => null);
      } catch {}
      return interaction.reply({
        embeds: [applyFooter(ok('📝 Oggetto aggiornato', testo ? `Ticket #${ticket.number}: "${truncate(testo, 120)}".` : `Oggetto del ticket #${ticket.number} rimosso.`), interaction)],
      });
    }

    if (sub === 'nota') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const testo = interaction.options.getString('testo', true);
      const { addNote } = require('../../database/tickets');
      try {
        const t = addNote(interaction.guild.id, interaction.channelId, interaction.user.tag, testo);
        return interaction.reply({ embeds: [applyFooter(ok('📌 Nota salvata', `Nota #${(t.notes || []).length} sul ticket #${ticket.number} (visibile solo nei log staff).`), interaction)] });
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Nota non valida.')], flags: MessageFlags.Ephemeral });
      }
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
