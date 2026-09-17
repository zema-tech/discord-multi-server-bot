const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Espelli un utente dal server')
    .addUserOption((o) => o.setName('utente').setDescription("L'utente da espellere").setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser('utente');
    const reason = (interaction.options.getString('motivo') || 'Nessun motivo specificato').slice(0, 1024);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ Utente non trovato nel server.', flags: MessageFlags.Ephemeral });
    if (user.id === interaction.user.id)
      return interaction.reply({ content: '❌ Non puoi espellere te stesso!', flags: MessageFlags.Ephemeral });
    if (member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: '❌ Non puoi espellere il proprietario del server.', flags: MessageFlags.Ephemeral });
    if (!member.kickable)
      return interaction.reply({ content: '❌ Non ho i permessi per espellere questo utente.', flags: MessageFlags.Ephemeral });
    if (!hierarchyAllows(interaction, member))
      return interaction.reply({ content: '❌ Ruolo uguale/superiore al tuo.', flags: MessageFlags.Ephemeral });

    try {
      await member.kick(`${reason} | Mod: ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('👢 Utente espulso')
        .addFields(
          { name: 'Utente', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderatore', value: interaction.user.tag, inline: true },
          { name: 'Motivo', value: reason }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Errore durante il kick.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Errore durante il kick.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
