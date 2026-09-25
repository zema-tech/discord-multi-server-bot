const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, MessageFlags,
} = require('discord.js');
const { getConfig, getTicket, getStats } = require('../../database/tickets');
const { isSupport, doClose, typeLabel, priorityLabel, ticketButtons, buildTypePanel } = require('../../handlers/ticketHandler');

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
    .addSubcommand((s) => s.setName('panel').setDescription('Pubblica il pannello ticket con bottoni (staff)')
      .addChannelOption((o) => o.setName('canale').setDescription('Dove pubblicarlo (default: qui)').addChannelTypes(ChannelType.GuildText).setRequired(false))
      .addStringOption((o) => o.setName('tipi').setDescription('Tipi separati da virgola (default: tutti)').setRequired(false).setMaxLength(100))
      .addStringOption((o) => o.setName('titolo').setDescription('Titolo del pannello').setRequired(false).setMaxLength(100)))
    .addSubcommand((s) => s.setName('domande-mostra').setDescription('Mostra le domande pre-apertura per tipo')
      .addStringOption((o) => o.setName('tipo').setDescription('Tipo di ticket').setRequired(true)
        .addChoices(
          { name: '🛠️ Supporto', value: 'supporto' },
          { name: '🐛 Bug', value: 'bug' },
          { name: '⚖️ Appeal', value: 'appeal' },
          { name: '🤝 Partnership', value: 'partnership' },
        )))
    .addSubcommand((s) => s.setName('domande-imposta').setDescription('Imposta le domande pre-apertura (staff, max 5)')
      .addStringOption((o) => o.setName('tipo').setDescription('Tipo di ticket').setRequired(true)
        .addChoices(
          { name: '🛠️ Supporto', value: 'supporto' },
          { name: '🐛 Bug', value: 'bug' },
          { name: '⚖️ Appeal', value: 'appeal' },
          { name: '🤝 Partnership', value: 'partnership' },
        ))
      .addStringOption((o) => o.setName('d1').setDescription('Domanda 1 (obbligatoria)').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('d2').setDescription('Domanda 2').setRequired(false).setMaxLength(200))
      .addStringOption((o) => o.setName('d3').setDescription('Domanda 3').setRequired(false).setMaxLength(200))
      .addStringOption((o) => o.setName('d4').setDescription('Domanda 4').setRequired(false).setMaxLength(200))
      .addStringOption((o) => o.setName('d5').setDescription('Domanda 5').setRequired(false).setMaxLength(200)))
    .addSubcommand((s) => s.setName('domande-reset').setDescription('Rimuove le domande pre-apertura (staff)')
      .addStringOption((o) => o.setName('tipo').setDescription('Tipo di ticket').setRequired(true)
        .addChoices(
          { name: '🛠️ Supporto', value: 'supporto' },
          { name: '🐛 Bug', value: 'bug' },
          { name: '⚖️ Appeal', value: 'appeal' },
          { name: '🤝 Partnership', value: 'partnership' },
        )))
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
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiche dei ticket del server'))
    .addSubcommand((s) =>
      s.setName('rinomina').setDescription('Rinomina il canale del ticket')
        .addStringOption((o) => o.setName('nome').setDescription('Nuovo nome (max 80)').setRequired(true).setMaxLength(80))
    )
    .addSubcommand((s) =>
      s.setName('tipo').setDescription('Cambia il tipo del ticket (staff)')
        .addStringOption((o) => o.setName('nuovo').setDescription('Nuovo tipo').setRequired(true)
          .addChoices(
            { name: '🛠️ Supporto', value: 'supporto' },
            { name: '🐛 Bug', value: 'bug' },
            { name: '⚖️ Appeal', value: 'appeal' },
            { name: '🤝 Partnership', value: 'partnership' },
          ))
    )
    .addSubcommand((s) =>
      s.setName('trasferisci').setDescription('Trasferisci la proprietà del ticket (staff)')
        .addUserOption((o) => o.setName('utente').setDescription('Nuovo proprietario').setRequired(true))
    )
    .addSubcommand((s) => s.setName('proteggi').setDescription('Proteggi il ticket da auto-chiusura/eliminazione (staff)'))
    .addSubcommand((s) =>
      s.setName('blacklist').setDescription('Blocca/sblocca utenti dai ticket (staff)')
        .addStringOption((o) => o.setName('azione').setDescription('Aggiungi, rimuovi o lista').setRequired(true)
          .addChoices(
            { name: 'Aggiungi', value: 'aggiungi' },
            { name: 'Rimuovi', value: 'rimuovi' },
            { name: 'Lista', value: 'lista' },
          ))
        .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('autoelimina').setDescription('Elimina i ticket chiusi dopo N giorni, 0 = off (staff)')
        .addIntegerOption((o) => o.setName('giorni').setDescription('Giorni (0-90)').setRequired(true).setMinValue(0).setMaxValue(90))
    )
    .addSubcommand((s) =>
      s.setName('sposta').setDescription('Sposta il ticket in un’altra categoria (staff)')
        .addChannelOption((o) => o.setName('categoria').setDescription('Categoria di destinazione').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('tag').setDescription('Risposte rapide staff: usa, crea, lista o rimuovi')
        .addStringOption((o) => o.setName('azione').setDescription('Cosa fare').setRequired(true)
          .addChoices(
            { name: 'Usa (invia nel ticket)', value: 'usa' },
            { name: 'Crea/aggiorna (staff)', value: 'crea' },
            { name: 'Lista', value: 'lista' },
            { name: 'Rimuovi (staff)', value: 'rimuovi' },
          ))
        .addStringOption((o) => o.setName('nome').setDescription('Nome tag').setRequired(false).setMaxLength(32))
        .addStringOption((o) => o.setName('testo').setDescription('Testo (solo per crea)').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((s) => s.setName('archivio').setDescription('Ultimi ticket chiusi: ritrovali nei log (staff)')),
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

    // ---- PANEL PRO: pubblica pannello con bottoni per sezione ----
    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      const { TICKET_TYPES, savePanel } = require('../../database/tickets');
      const target = interaction.options.getChannel('canale') || interaction.channel;
      if (!target || target.type !== ChannelType.GuildText) {
        return interaction.reply({ embeds: [themeErr('Canale di testo non valido.')], flags: MessageFlags.Ephemeral });
      }
      const rawTipi = (interaction.options.getString('tipi') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const types = rawTipi.length ? rawTipi.filter((t) => TICKET_TYPES[t]) : Object.keys(TICKET_TYPES);
      if (!types.length) {
        return interaction.reply({ embeds: [themeErr(`Tipi non validi. Usa: ${Object.keys(TICKET_TYPES).join(', ')}.`)], flags: MessageFlags.Ephemeral });
      }
      const titolo = (interaction.options.getString('titolo') || '🎫 Centro Assistenza').slice(0, 100);
      let msg;
      try {
        const payload = buildTypePanel(types, titolo);
        msg = await target.send(payload);
      } catch {
        return interaction.reply({ embeds: [themeErr('Non riesco a scrivere in quel canale.')], flags: MessageFlags.Ephemeral });
      }
      try {
        savePanel(interaction.guild.id, { channelId: target.id, messageId: msg.id, types, title: titolo });
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Pannello pubblicato ma non registrato.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: `✅ Pannello pubblicato in ${target} (${types.length} sezioni).`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    // ---- DOMANDE PRE-APERTURA ----
    if (sub === 'domande-mostra') {
      const { getQuestions } = require('../../database/tickets');
      const tipo = interaction.options.getString('tipo', true);
      const list = getQuestions(interaction.guild.id, tipo);
      if (!list.length) {
        return interaction.reply({ content: `ℹ️ Nessuna domanda pre-apertura per **${typeLabel(tipo)}**: il ticket si apre subito.`, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📋 Domande pre-apertura — ${typeLabel(tipo)}`)
        .setDescription(list.map((q, i) => `**${i + 1}.** ${q}${i === 0 ? ' *(obbligatoria)*' : ''}`).join('\n'))
        .setTimestamp();
      applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'domande-imposta') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      const { setQuestions } = require('../../database/tickets');
      const tipo = interaction.options.getString('tipo', true);
      const list = ['d1', 'd2', 'd3', 'd4', 'd5'].map((k) => interaction.options.getString(k) || '').filter((s) => s.trim());
      const saved = setQuestions(interaction.guild.id, tipo, list);
      return interaction.reply({ content: `✅ Domande per **${typeLabel(tipo)}** impostate (${saved.length}):\n${saved.map((q, i) => `**${i + 1}.** ${q}`).join('\n')}`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'domande-reset') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      const { setQuestions } = require('../../database/tickets');
      const tipo = interaction.options.getString('tipo', true);
      setQuestions(interaction.guild.id, tipo, []);
      return interaction.reply({ content: `✅ Domande per **${typeLabel(tipo)}** rimosse: il ticket si apre subito.`, flags: MessageFlags.Ephemeral }).catch(() => null);
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
      // Classifica staff: chiusure + gradimento.
      try {
        const { getStaffStats } = require('../../database/tickets');
        const top = getStaffStats(interaction.guild.id, 3);
        if (top.length) {
          embed.addFields({
            name: '🏆 Top staff',
            value: truncate(top.map((s, i) => `${['🥇', '🥈', '🥉'][i] || '•'} <@${s.userId}>: **${s.closed}** chiusure${s.avgRating !== null ? ` • ⭐ ${s.avgRating}` : ''}`).join('\n'), 1024),
          });
        }
      } catch {}
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
        const { ticketTranscript } = require('../../handlers/ticketHandler');
        file = await ticketTranscript(interaction.channel, ticket);
      } catch {
        return interaction.editReply({ embeds: [themeErr('Errore nella generazione del transcript.')] }).catch(() => {});
      }
      if (!file) {
        return interaction.editReply({ embeds: [themeErr('Errore nella generazione del transcript.')] }).catch(() => {});
      }
      return interaction.editReply({ content: `📝 Transcript del ticket #${ticket.number}:`, files: [file] }).catch(() => {});
    }

    if (sub === 'rinomina') {
      const allowed = staff || ticket.ownerId === interaction.user.id;
      if (!allowed) return interaction.reply({ embeds: [themeErr('Solo il proprietario o lo staff.')], flags: MessageFlags.Ephemeral });
      const nome = interaction.options.getString('nome', true).toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `ticket-${ticket.number}`;
      try {
        await interaction.channel.setName(nome);
        return interaction.reply({ embeds: [applyFooter(ok('✏️ Rinomina', `Canale rinominato in **${nome}**.`), interaction)] });
      } catch {
        return interaction.reply({ embeds: [themeErr('Non riesco a rinominare: verifica i miei permessi.')], flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'tipo') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const nuovo = interaction.options.getString('nuovo', true);
      const { setTicketType } = require('../../database/tickets');
      try {
        setTicketType(interaction.guild.id, interaction.channelId, nuovo);
      } catch {
        return interaction.reply({ embeds: [themeErr('Tipo non valido.')], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [applyFooter(ok('🔄 Tipo cambiato', `Ticket #${ticket.number} ora è **${typeLabel(nuovo)}**.`), interaction)] });
    }

    if (sub === 'trasferisci') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('utente');
      if (!target || target.bot) return interaction.reply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
      if (target.id === ticket.ownerId) return interaction.reply({ embeds: [themeErr('È già il proprietario.')], flags: MessageFlags.Ephemeral });
      const { transferTicket } = require('../../database/tickets');
      try {
        transferTicket(interaction.guild.id, interaction.channelId, target.id);
      } catch {
        return interaction.reply({ embeds: [themeErr('Trasferimento fallito.')], flags: MessageFlags.Ephemeral });
      }
      try {
        await interaction.channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await interaction.channel.permissionOverwrites.delete(ticket.ownerId).catch(() => null);
      } catch {}
      try {
        const topic = `Ticket #${ticket.number} | owner ${target.id} | tipo ${ticket.type}`;
        await interaction.channel.setTopic(topic.slice(0, 1024)).catch(() => null);
      } catch {}
      return interaction.reply({ embeds: [applyFooter(ok('🔄 Ticket trasferito', `Ticket #${ticket.number} ora appartiene a ${target}.`), interaction)] });
    }

    if (sub === 'proteggi') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const { setPinned } = require('../../database/tickets');
      const updated = setPinned(interaction.guild.id, interaction.channelId, !ticket.pinned);
      if (!updated) return interaction.reply({ embeds: [themeErr('Ticket non trovato.')], flags: MessageFlags.Ephemeral });
      return interaction.reply({
        embeds: [applyFooter(ok(updated.pinned ? '📌 Ticket protetto' : '📌 Protezione rimossa',
          updated.pinned ? `Il ticket #${ticket.number} resiste ad auto-chiusura ed eliminazione.` : `Il ticket #${ticket.number} segue di nuovo le regole automatiche.`), interaction)],
      });
    }

    if (sub === 'blacklist') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const { setBlacklisted, getConfig: getTConfig } = require('../../database/tickets');
      const azione = interaction.options.getString('azione', true);
      if (azione === 'lista') {
        const bl = getTConfig(interaction.guild.id).blacklist || [];
        return interaction.reply({
          content: bl.length ? `⛔ Blacklist ticket (${bl.length}):\n${bl.map((id) => `• <@${id}>`).join('\n').slice(0, 3500)}` : '⛔ Blacklist vuota.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
      const target = interaction.options.getUser('utente');
      if (!target) return interaction.reply({ embeds: [themeErr('Specifica un utente.')], flags: MessageFlags.Ephemeral });
      if (target.bot) return interaction.reply({ embeds: [themeErr('Non puoi bloccare un bot.')], flags: MessageFlags.Ephemeral });
      try {
        const changed = setBlacklisted(interaction.guild.id, target.id, azione === 'aggiungi');
        return interaction.reply({
          content: azione === 'aggiungi'
            ? (changed ? `⛔ ${target} non potrà più aprire ticket.` : `ℹ️ ${target} era già in blacklist.`)
            : (changed ? `✅ ${target} rimosso dalla blacklist.` : `ℹ️ ${target} non era in blacklist.`),
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Operazione fallita.')], flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'autoelimina') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      const giorni = interaction.options.getInteger('giorni', true);
      const { setConfig } = require('../../database/tickets');
      setConfig(interaction.guild.id, { autoDeleteDays: giorni });
      return interaction.reply({
        content: giorni > 0 ? `🗑️ I ticket chiusi verranno eliminati dopo **${giorni} giorni** (i 📌 protetti resistono).` : '🗑️ Auto-eliminazione disattivata.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    if (sub === 'sposta') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const categoria = interaction.options.getChannel('categoria');
      if (!categoria || categoria.type !== ChannelType.GuildCategory) {
        return interaction.reply({ embeds: [themeErr('Categoria non valida.')], flags: MessageFlags.Ephemeral });
      }
      try {
        await interaction.channel.setParent(categoria.id, { lockPermissions: false });
        return interaction.reply({ embeds: [applyFooter(ok('📁 Ticket spostato', `Ticket #${ticket.number} spostato in **${categoria.name}**.`), interaction)] });
      } catch {
        return interaction.reply({ embeds: [themeErr('Spostamento fallito: verifica i miei permessi.')], flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'tag') {
      const { getTag, listTags, setTag, removeTag } = require('../../database/tickets');
      const azione = interaction.options.getString('azione', true);
      if (azione === 'lista') {
        const tags = listTags(interaction.guild.id);
        if (!tags.length) {
          return interaction.reply({ content: 'ℹ️ Nessun tag. Creane uno con `/ticket tag azione:Crea`.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`🏷️ Tag risposte rapide (${tags.length})`)
          .setDescription(truncate(tags.map((t) => `**${t.name}** — ${t.text.slice(0, 80)}`).join('\n'), 4000))
          .setTimestamp();
        applyFooter(embed, interaction);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (azione === 'usa') {
        const nome = (interaction.options.getString('nome') || '').toLowerCase().trim();
        const text = nome ? getTag(interaction.guild.id, nome) : null;
        if (!text) {
          return interaction.reply({ embeds: [themeErr('Tag non trovato. Vedi la lista con `/ticket tag azione:Lista`.')], flags: MessageFlags.Ephemeral });
        }
        const allowed = staff || ticket.ownerId === interaction.user.id;
        if (!allowed) return interaction.reply({ embeds: [themeErr('Solo il proprietario o lo staff.')], flags: MessageFlags.Ephemeral });
        try {
          await interaction.channel.send(`🏷️ **${nome}**\n${text.slice(0, 1800)}`);
          return interaction.reply({ content: `✅ Tag **${nome}** inviato.`, flags: MessageFlags.Ephemeral }).catch(() => null);
        } catch {
          return interaction.reply({ embeds: [themeErr('Non riesco a scrivere nel canale.')], flags: MessageFlags.Ephemeral });
        }
      }
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const nome = interaction.options.getString('nome');
      if (!nome) return interaction.reply({ embeds: [themeErr('Specifica il nome del tag.')], flags: MessageFlags.Ephemeral });
      if (azione === 'crea') {
        const testo = interaction.options.getString('testo');
        if (!testo) return interaction.reply({ embeds: [themeErr('Specifica il testo del tag.')], flags: MessageFlags.Ephemeral });
        try {
          const saved = setTag(interaction.guild.id, nome, testo);
          return interaction.reply({ content: `✅ Tag **${saved.name}** salvato (${saved.text.length} caratteri).`, flags: MessageFlags.Ephemeral }).catch(() => null);
        } catch (e) {
          return interaction.reply({ embeds: [themeErr(e?.message || 'Tag non valido.')], flags: MessageFlags.Ephemeral });
        }
      }
      const okRm = removeTag(interaction.guild.id, nome);
      return interaction.reply({ content: okRm ? `✅ Tag **${nome.toLowerCase().trim()}** eliminato.` : '❌ Tag non trovato.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'archivio') {
      if (!staff) return interaction.reply({ embeds: [themeErr('Solo lo staff.')], flags: MessageFlags.Ephemeral });
      const { recentClosed } = require('../../database/tickets');
      const closed = recentClosed(interaction.guild.id, 10);
      if (!closed.length) {
        return interaction.reply({ content: '🗃️ Nessun ticket chiuso in archivio.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🗃️ Archivio ticket chiusi (${closed.length})`)
        .setDescription(truncate(closed.map((t) => {
          const when = Number.isFinite(t.closedAt) ? `<t:${Math.floor(t.closedAt / 1000)}:d>` : '—';
          const star = t.rating && t.rating.score ? ` • ⭐${t.rating.score}` : '';
          return `**#${t.number}** ${typeLabel(t.type)} — <@${t.ownerId}> • ${when}${star}${t.closeReason ? `\n_${truncate(t.closeReason, 80)}_` : ''}`;
        }).join('\n\n'), 4000))
        .setFooter({ text: 'Transcript completi nel canale log' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
  },
};
