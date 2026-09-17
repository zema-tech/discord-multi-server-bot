const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');

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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Timeout rimosso';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ Utente non nel server.', flags: MessageFlags.Ephemeral });
    if (!member.moderatable)
      return interaction.reply({ content: '❌ Non posso moderare questo utente.', flags: MessageFlags.Ephemeral });
    if (member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: '❌ Non puoi moderare il proprietario del server.', flags: MessageFlags.Ephemeral });
    if (!hierarchyAllows(interaction, member))
      return interaction.reply({ content: '❌ Ruolo uguale/superiore al tuo.', flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(null, `${reason} | Mod: ${interaction.user.tag}`);
      const embed = new EmbedBuilder().setColor(0x57f287).setTitle('✅ Timeout rimosso').setDescription(`${user.tag} può di nuovo parlare.`).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Errore.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Errore.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
