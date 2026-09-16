const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Blocca/sblocca un canale testuale')
    .addSubcommand((s) => s.setName('on').setDescription('Blocca il canale (solo staff può scrivere)'))
    .addSubcommand((s) => s.setName('off').setDescription('Sblocca il canale'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const everyone = interaction.guild.roles.everyone;
    try {
      if (sub === 'on') {
        await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: false });
        await interaction.reply('🔒 Canale **bloccato**.');
      } else {
        await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: null });
        await interaction.reply('🔓 Canale **sbloccato**.');
      }
    } catch {
      await interaction.reply({ content: '❌ Errore permessi.', flags: MessageFlags.Ephemeral });
    }
  },
};
