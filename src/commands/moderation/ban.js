const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');

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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser('utente');
    const reason = (interaction.options.getString('motivo') || 'Nessun motivo specificato').slice(0, 1024);
    const days = interaction.options.getInteger('giorni') ?? 0;
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);

    if (user.id === interaction.user.id)
      return interaction.reply({ content: '❌ Non puoi bannare te stesso!', flags: MessageFlags.Ephemeral });
    if (user.id === interaction.client.user.id)
      return interaction.reply({ content: '❌ Non puoi bannare me!', flags: MessageFlags.Ephemeral });
    if (member) {
      if (member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
        return interaction.reply({ content: '❌ Non puoi bannare il proprietario del server.', flags: MessageFlags.Ephemeral });
      if (!member.bannable)
        return interaction.reply({ content: '❌ Non ho i permessi per bannare questo utente.', flags: MessageFlags.Ephemeral });
      if (!hierarchyAllows(interaction, member))
        return interaction.reply({ content: '❌ Ruolo uguale/superiore al tuo.', flags: MessageFlags.Ephemeral });
    }

    try {
      await interaction.guild.members.ban(user, { reason: `${reason} | Mod: ${interaction.user.tag}`, deleteMessageSeconds: days * 86400 });
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🚫 Utente bannato')
        .addFields(
          { name: 'Utente', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
          { name: 'Motivo', value: reason }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Errore durante il ban.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Errore durante il ban.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
