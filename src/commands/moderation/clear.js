const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
let theme = null;
try { theme = require('../../utils/theme'); } catch { theme = null; }
const okEmbed = theme?.ok ?? ((t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t)).setDescription(String(d ?? '')).setTimestamp());
const errEmbed = theme?.err ?? ((t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '')).setTimestamp());
const applyFooter = theme?.applyFooter ?? ((e) => e);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Cancella messaggi con filtri (max 100, solo ultimi 14 giorni)')
    .addIntegerOption((o) => o.setName('quantita').setDescription('Numero di messaggi (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('utente').setDescription('Cancella solo i messaggi di questo utente').setRequired(false))
    .addBooleanOption((o) => o.setName('solo-bot').setDescription('Solo messaggi dei bot').setRequired(false))
    .addBooleanOption((o) => o.setName('con-link').setDescription('Solo messaggi con link/embed').setRequired(false))
    .addStringOption((o) => o.setName('contiene').setDescription('Solo messaggi che contengono questo testo').setRequired(false).setMaxLength(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const qtyRaw = interaction.options.getInteger('quantita');
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(100, qtyRaw)) : 0;
    const user = interaction.options.getUser('utente');
    const onlyBots = interaction.options.getBoolean('solo-bot') === true;
    const withLinks = interaction.options.getBoolean('con-link') === true;
    const contains = (interaction.options.getString('contiene') || '').toLowerCase();
    const fail = (embed) => {
      if (interaction.deferred || interaction.replied) return interaction.editReply({ embeds: [embed] }).catch(() => {});
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    };
    if (!qty) return fail(errEmbed('Quantità non valida (1-100).'));
    if (!interaction.channel?.isTextBased?.() || typeof interaction.channel.bulkDelete !== 'function') {
      return fail(errEmbed('Usa questo comando in un canale testuale del server.'));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
    if (!interaction.deferred && !interaction.replied) {
      return;
    }
    try {
      const hasFilter = Boolean(user || onlyBots || withLinks || contains);
      let messages = await interaction.channel.messages.fetch({ limit: hasFilter ? 100 : qty });
      if (hasFilter) {
        const linkRe = /https?:\/\/|discord\.gg\/|www\./i;
        messages = messages.filter((m) => {
          if (user && m.author.id !== user.id) return false;
          if (onlyBots && !m.author.bot) return false;
          if (withLinks && !linkRe.test(m.content || '') && !(m.embeds && m.embeds.length) && !(m.attachments && m.attachments.size)) return false;
          if (contains && !(m.content || '').toLowerCase().includes(contains)) return false;
          return true;
        }).first(qty);
      }
      const empty = !messages || (typeof messages.size === 'number' ? messages.size === 0 : messages.length === 0);
      if (empty) {
        return interaction.editReply({ embeds: [errEmbed('Nessun messaggio da cancellare.')] }).catch(() => {});
      }
      const deleted = await interaction.channel.bulkDelete(messages, true);
      if (!deleted || deleted.size === 0) {
        return interaction.editReply({ embeds: [errEmbed('Nessun messaggio cancellato (solo messaggi degli ultimi 14 giorni si possono eliminare in blocco).')] }).catch(() => {});
      }
      const what = [
        user ? `di ${user.tag ?? user.username}` : '',
        onlyBots ? 'dei bot' : '',
        withLinks ? 'con link' : '',
        contains ? `con "${contains.slice(0, 40)}"` : '',
      ].filter(Boolean).join(' ');
      const done = okEmbed('🧹 Pulizia completata', `Cancellati **${deleted.size}** messaggi${what ? ` ${what}` : ''}.`);
      applyFooter(done, interaction);
      await interaction.editReply({ embeds: [done] }).catch(() => {});
      try {
        const { sendLog } = require('../../utils/helpers');
        await sendLog(interaction.guild, { embeds: [done] }).catch(() => {});
      } catch {}
    } catch (e) {
      console.error(e);
      if (e?.code === 50034 || e?.message?.includes('14')) {
        await interaction.editReply({ embeds: [errEmbed('Impossibile cancellare (messaggi più vecchi di 14 giorni non si possono eliminare in blocco).')] }).catch(() => {});
      } else {
        await interaction.editReply({ embeds: [errEmbed('Impossibile cancellare i messaggi. Verifica i miei permessi (Gestisci Messaggi, Leggere Cronologia).')] }).catch(() => {});
      }
    }
  },
};
