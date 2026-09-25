const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog } = require('../../utils/helpers');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('segnala')
    .setDescription('Segnala un utente allo staff (report)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente segnalato').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Cosa è successo').setRequired(true).setMaxLength(500)),
  cooldown: 60,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const target = interaction.options.getUser('utente');
    const reason = truncate((interaction.options.getString('motivo') || '').trim(), 500);
    if (!target) return interaction.reply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
    if (!reason) return interaction.reply({ embeds: [themeErr('Descrivi il motivo.')], flags: MessageFlags.Ephemeral });
    if (target.id === interaction.user.id) {
      return interaction.reply({ embeds: [themeErr('Non puoi segnalare te stesso.')], flags: MessageFlags.Ephemeral });
    }
    if (target.bot) {
      return interaction.reply({ embeds: [themeErr('Non puoi segnalare un bot.')], flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`🚨 Segnalazione — ${truncate(target.tag ?? target.username, 200)}`.slice(0, 256))
      .addFields(
        { name: 'Segnalato', value: `${target} (\`${target.id}\`)`, inline: true },
        { name: 'Da', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
        { name: 'Canale', value: `${interaction.channel}`, inline: true },
        { name: 'Motivo', value: reason }
      )
      .setTimestamp();
    // sendLog non lancia mai: verifica prima che il canale log esista davvero.
    try {
      const { getGuild } = require('../../database/guildConfig');
      if (!getGuild(interaction.guild.id)?.logChannelId) {
        return interaction.reply({ embeds: [themeErr('Canale log non configurato: chiedi allo staff di impostarlo.')], flags: MessageFlags.Ephemeral });
      }
    } catch {
      return interaction.reply({ embeds: [themeErr('Canale log non configurato: chiedi allo staff di impostarlo.')], flags: MessageFlags.Ephemeral });
    }
    await sendLog(interaction.guild, { content: '🚨 Nuova segnalazione', embeds: [embed] }).catch(() => {});
    return interaction.reply({ content: '✅ Segnalazione inviata allo staff. Grazie!', flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
