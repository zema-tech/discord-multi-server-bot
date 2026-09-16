const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Rigenera il canale (clona + elimina il vecchio)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 10,
  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`nuke_confirm:${interaction.channelId}`).setLabel('CONFERMA NUKE').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('nuke_cancel').setLabel('Annulla').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ content: `⚠️ **Sei sicuro?** Tutti i messaggi di ${interaction.channel} verranno eliminati.`, components: [row], flags: MessageFlags.Ephemeral });
  },
};
