const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const { getPanel, setPanel } = require('../../database/reactionRoles');

// Theme condiviso con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2 };
let truncate = (s, max) => {
  const str = typeof s === 'string' ? s : String(s ?? '');
  const m = Math.floor(Number(max));
  if (!Number.isFinite(m) || m < 0) return str;
  return str.length <= m ? str : str.slice(0, m);
};
try {
  const theme = require('../../utils/theme');
  if (theme?.COLORS) COLORS = theme.COLORS;
  if (typeof theme?.truncate === 'function') truncate = theme.truncate;
} catch {}

// Configurazione solo dalla dashboard web: nessun accesso in scrittura al DB da qui
// (fa eccezione /reactionroles pubblica, che posta il pannello gia configurato).
function dashboardMessaggio(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '') || 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${base}/app.html#gid=${guildId} — sezione ${sezione}`;
}

function checkRoleValid(guild, role) {
  if (role.id === guild.id) return '❌ Non puoi usare il ruolo @everyone.';
  if (role.managed) return '❌ Questo ruolo è gestito da un\u2019integrazione (bot/boost) e non può essere usato.';
  if (!role.editable) return '❌ Non posso gestire questo ruolo: è sopra il mio ruolo più alto o mi mancano i permessi. Sposta il mio ruolo più in alto.';
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Crea un pannello reaction roles con menu di selezione')
    .addSubcommand((s) =>
      s.setName('crea').setDescription('Imposta canale, titolo e descrizione del pannello')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale dove pubblicare il pannello').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('titolo').setDescription('Titolo del pannello').setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName('descrizione').setDescription('Descrizione del pannello').setRequired(true).setMaxLength(1000))
    )
    .addSubcommand((s) =>
      s.setName('aggiungi').setDescription('Aggiungi un ruolo al pannello')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da assegnare').setRequired(true))
        .addStringOption((o) => o.setName('etichetta').setDescription('Etichetta mostrata nel menu').setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji unicode o custom del server').setRequired(true).setMaxLength(50))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi un ruolo dal pannello')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da rimuovere').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('pubblica').setDescription('Pubblica il pannello nel canale scelto')
    )
    .addSubcommand((s) =>
      s.setName('elimina').setDescription('Elimina il pannello e la configurazione')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = guild.id;

    // Configurazione (crea/aggiungi/rimuovi/elimina) solo dalla dashboard web.
    // Fa eccezione 'pubblica', che posta il pannello gia configurato (azione).
    if (sub === 'crea' || sub === 'aggiungi' || sub === 'rimuovi' || sub === 'elimina') {
      return interaction.reply({ content: dashboardMessaggio(guildId, 'Reaction roles'), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'pubblica') {
      const panel = getPanel(guildId);
      if (!panel.channelId) {
        return interaction.reply({ content: '❌ Prima configura il pannello dalla dashboard, poi ripubblica.', flags: MessageFlags.Ephemeral });
      }
      if (!panel.options.length) {
        return interaction.reply({ content: '❌ Il pannello non ha opzioni: aggiungile dalla dashboard, poi ripubblica.', flags: MessageFlags.Ephemeral });
      }
      const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
      if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
        return interaction.reply({ content: '❌ Canale non trovato. Reimposta il pannello dalla dashboard con un canale valido.', flags: MessageFlags.Ephemeral });
      }

      // Filtra ruoli non più validi al momento della pubblicazione
      const validOptions = [];
      const skipped = [];
      for (const opt of panel.options) {
        const role = await guild.roles.fetch(opt.roleId).catch(() => null);
        const err = role ? checkRoleValid(guild, role) : 'eliminato';
        if (!role || err) {
          skipped.push(opt.label);
          continue;
        }
        validOptions.push(opt);
      }
      if (!validOptions.length) {
        return interaction.reply({ content: '❌ Nessun ruolo valido da pubblicare: ricontrolla ruoli ed emoji, poi riprova.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(truncate(panel.title, 256))
        .setDescription(truncate(`✨ **Scegli i tuoi ruoli dal menu qui sotto!**\n\n${panel.description}`, 4000))
        .addFields({ name: `🎭 Ruoli disponibili (${validOptions.length})`, value: truncate(validOptions.map((o) => `${o.emoji} <@&${o.roleId}> — *${truncate(o.label, 100)}*`).join('\n'), 1024) || '—' })
        .setFooter({ text: truncate(`${guild.name} • Seleziona dal menu per ottenere/rimuovere il ruolo`, 200) })
        .setTimestamp();

      // BUGFIX limiti: select Discord max 25 opzioni/valori -> clamp difensivo anche se MAX_OPTIONS cambiasse.
      const menuOptions = validOptions.slice(0, 25).map((opt) => ({ label: truncate(opt.label, 100) || 'Ruolo', value: opt.roleId, emoji: opt.emoji }));
      const menu = new StringSelectMenuBuilder()
        .setCustomId('rr_select')
        .setPlaceholder('Seleziona un ruolo…')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(menuOptions);

      let message;
      try {
        message = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      } catch (e) {
        console.error('reactionroles pubblica:', e);
        return interaction.reply({ content: '❌ Impossibile inviare il pannello: verifica i miei permessi nel canale scelto.', flags: MessageFlags.Ephemeral });
      }
      setPanel(guildId, { messageId: message.id });
      const warn = skipped.length ? `\n\n⚠️ Ignorati ${skipped.length} ruoli non validi: ${skipped.join(', ').slice(0, 500)}` : '';
      return interaction.reply({ content: `✅ Pannello pubblicato in ${channel} (${validOptions.length} opzioni).${warn}`, flags: MessageFlags.Ephemeral });
    }

    // elimina: configurazione solo dalla dashboard (ramo gia gestito sopra).
    return null;
  },
};
