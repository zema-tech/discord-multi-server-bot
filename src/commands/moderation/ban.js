const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');
const { logCase } = require('../../database/cases');
let theme = null;
try { theme = require('../../utils/theme'); } catch { theme = null; }
const COLORS = theme?.COLORS ?? { error: 0xed4245 };
const applyFooter = theme?.applyFooter ?? ((e) => e);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));
const errEmbed = theme?.err ?? ((t) => new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '')).setTimestamp());

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banna un utente dal server')
    .addUserOption((o) => o.setName('utente').setDescription("L'utente da bannare").setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo del ban').setRequired(false))
    .addIntegerOption((o) =>
      o.setName('giorni').setDescription('Giorni di messaggi da eliminare (0-7)').setMinValue(0).setMaxValue(7).setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [errEmbed('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const user = interaction.options.getUser('utente');
    if (!user) return interaction.reply({ embeds: [errEmbed('Utente non valido.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    const reason = truncate(interaction.options.getString('motivo') || 'Nessun motivo specificato', 512);
    const days = interaction.options.getInteger('giorni') ?? 0;
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);

    if (user.id === interaction.user.id)
      return interaction.reply({ embeds: [errEmbed('Non puoi bannare te stesso!')], flags: MessageFlags.Ephemeral }).catch(() => null);
    if (user.id === interaction.client.user.id)
      return interaction.reply({ embeds: [errEmbed('Non puoi bannare me!')], flags: MessageFlags.Ephemeral }).catch(() => null);
    if (member) {
      if (member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
        return interaction.reply({ embeds: [errEmbed('Non puoi bannare il proprietario del server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!member.bannable)
        return interaction.reply({ embeds: [errEmbed('Non ho i permessi per bannare questo utente.')], flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!hierarchyAllows(interaction, member))
        return interaction.reply({ embeds: [errEmbed('Ruolo uguale/superiore al tuo.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    try {
      const auditReason = truncate(`${reason} | Mod: ${interaction.user.tag ?? interaction.user.username}`, 512);
      await interaction.guild.members.ban(user, { reason: auditReason, deleteMessageSeconds: days * 86400 });
      try { logCase(interaction.guild.id, { type: 'ban', userId: user.id, modId: interaction.user.id, reason }); } catch {}
      const uname = user.tag ?? user.username;
      const embed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('🚫 Utente bannato')
        .addFields(
          { name: 'Utente', value: `${uname} (${user.id})`.slice(0, 1024), inline: true },
          { name: 'Moderatore', value: `${interaction.user.tag ?? interaction.user.username}`.slice(0, 1024), inline: true },
          ...(days > 0 ? [{ name: 'Messaggi eliminati', value: `${days}g`, inline: true }] : []),
          { name: 'Motivo', value: truncate(reason, 1024) || 'Nessun motivo specificato' }
        )
        .setTimestamp();
      applyFooter(embed, interaction);
      await interaction.reply({ embeds: [embed] }).catch(() => null);
      try { await sendLog(interaction.guild, { embeds: [embed] }); } catch {}
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errEmbed('Errore durante il ban.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [errEmbed('Errore durante il ban.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
