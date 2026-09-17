const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Rigenera il canale (clona + elimina il vecchio)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 10,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.channel?.isTextBased?.() || typeof interaction.channel.clone !== 'function') {
      return interaction.reply({ content: '❌ Usa questo comando in un canale testuale del server.', flags: MessageFlags.Ephemeral });
    }    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`nuke_confirm:${interaction.channelId}`).setLabel('CONFERMA NUKE').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('nuke_cancel').setLabel('Annulla').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ content: `⚠️ **Sei sicuro?** Tutti i messaggi di ${interaction.channel} verranno eliminati.`, components: [row], flags: MessageFlags.Ephemeral });
  },
};
