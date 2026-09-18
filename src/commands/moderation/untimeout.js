const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');

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
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const applyFooter = theme?.applyFooter ?? ((e) => e);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Rimuove il timeout da un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser('utente');
    if (!user) {
      return interaction.reply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
    }
    const reason = truncate(interaction.options.getString('motivo') || 'Timeout rimosso', 512);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ embeds: [themeErr('Utente non nel server.')], flags: MessageFlags.Ephemeral });
    if (!member.moderatable)
      return interaction.reply({ embeds: [themeErr('Non posso moderare questo utente (ruolo del bot troppo basso o permessi mancanti).')], flags: MessageFlags.Ephemeral });
    if (member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ embeds: [themeErr('Non puoi moderare il proprietario del server.')], flags: MessageFlags.Ephemeral });
    if (!hierarchyAllows(interaction, member))
      return interaction.reply({ embeds: [themeErr('Ruolo uguale/superiore al tuo.')], flags: MessageFlags.Ephemeral });
    if (!member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp <= Date.now())
      return interaction.reply({ embeds: [themeErr(`${user.tag ?? user.username} non è attualmente in timeout.`)], flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(null, `${reason} | Mod: ${interaction.user.tag}`.slice(0, 512));
      const embed = applyFooter(
        ok('✅ Timeout rimosso', `${truncate(user.tag ?? user.username, 100)} può di nuovo parlare.\n**Motivo:** ${reason}`),
        interaction
      );
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [themeErr('Errore durante la rimozione del timeout.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [themeErr('Errore durante la rimozione del timeout.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
