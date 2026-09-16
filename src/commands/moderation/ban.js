const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banna un utente dal server')
    .addUserOption(option =>
      option.setName('utente')
        .setDescription('L\'utente da bannare')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('motivo')
        .setDescription('Motivo del ban')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('giorni')
        .setDescription('Giorni di messaggi da eliminare (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  cooldown: 5,
  async execute(interaction) {
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';
    const days = interaction.options.getInteger('giorni') ?? 0;

    const member = interaction.guild.members.cache.get(user.id);

    if (user.id === interaction.user.id) {
      return interaction.reply({ content: 'Non puoi bannare te stesso!', ephemeral: true });
    }

    if (user.id === interaction.client.user.id) {
      return interaction.reply({ content: 'Non puoi bannare me!', ephemeral: true });
    }

    if (member) {
      if (!member.bannable) {
        return interaction.reply({ content: 'Non ho i permessi per bannare questo utente.', ephemeral: true });
      }
      if (interaction.member.roles.highest.position <= member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: 'Non puoi bannare qualcuno con un ruolo uguale o superiore al tuo.', ephemeral: true });
      }
    }

    try {
      await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: days * 24 * 60 * 60 });

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🚫 Utente Bannato')
        .addFields(
          { name: 'Utente', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
          { name: 'Motivo', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Si è verificato un errore durante il ban.', ephemeral: true });
    }
  },
};
