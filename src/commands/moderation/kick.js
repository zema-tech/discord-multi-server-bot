const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Espelli un utente dal server')
    .addUserOption(option =>
      option.setName('utente')
        .setDescription('L\'utente da espellere')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('motivo')
        .setDescription('Motivo del kick')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  cooldown: 5,
  async execute(interaction) {
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
      return interaction.reply({ content: 'Questo utente non è nel server.', ephemeral: true });
    }

    if (user.id === interaction.user.id) {
      return interaction.reply({ content: 'Non puoi kickare te stesso!', ephemeral: true });
    }

    if (!member.kickable) {
      return interaction.reply({ content: 'Non ho i permessi per kickare questo utente.', ephemeral: true });
    }

    if (interaction.member.roles.highest.position <= member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'Non puoi kickare qualcuno con un ruolo uguale o superiore al tuo.', ephemeral: true });
    }

    try {
      await member.kick(reason);

      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('👢 Utente Espulso')
        .addFields(
          { name: 'Utente', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderatore', value: `${interaction.user.tag}`, inline: true },
          { name: 'Motivo', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'Si è verificato un errore durante il kick.', ephemeral: true });
    }
  },
};
