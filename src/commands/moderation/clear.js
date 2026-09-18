const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
let theme = null;
try { theme = require('../../utils/theme'); } catch { theme = null; }
const okEmbed = theme?.ok ?? ((t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t)).setDescription(String(d ?? '')).setTimestamp());
const errEmbed = theme?.err ?? ((t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '')).setTimestamp());
const applyFooter = theme?.applyFooter ?? ((e) => e);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Cancella messaggi (max 100, solo ultimi 14 giorni)')
    .addIntegerOption((o) => o.setName('quantita').setDescription('Numero di messaggi (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('utente').setDescription('Cancella solo i messaggi di questo utente').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const qtyRaw = interaction.options.getInteger('quantita');
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(100, qtyRaw)) : 0;
    const user = interaction.options.getUser('utente');
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
      let messages = await interaction.channel.messages.fetch({ limit: user ? 100 : qty });
      if (user) messages = messages.filter((m) => m.author.id === user.id).first(qty);
      const empty = !messages || (typeof messages.size === 'number' ? messages.size === 0 : messages.length === 0);
      if (empty) {
        return interaction.editReply({ embeds: [errEmbed('Nessun messaggio da cancellare.')] }).catch(() => {});
      }
      const deleted = await interaction.channel.bulkDelete(messages, true);
      if (!deleted || deleted.size === 0) {
        return interaction.editReply({ embeds: [errEmbed('Nessun messaggio cancellato (solo messaggi degli ultimi 14 giorni si possono eliminare in blocco).')] }).catch(() => {});
      }
      const done = okEmbed('🧹 Pulizia completata', `Cancellati **${deleted.size}** messaggi${user ? ` di ${user.tag ?? user.username}` : ''}.`);
      applyFooter(done, interaction);
      await interaction.editReply({ embeds: [done] }).catch(() => {});
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
