const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Imposta lo slowmode di un canale')
    .addIntegerOption((o) => o.setName('secondi').setDescription('Secondi di attesa (0 = disattiva, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((o) => o.setName('canale').setDescription('Canale (default: questo)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  cooldown: 3,
  async execute(interaction) {
    const secs = interaction.options.getInteger('secondi');
    const ch = interaction.options.getChannel('canale') || interaction.channel;
    try {
      await ch.setRateLimitPerUser(secs, `Slowmode ${secs}s | Mod: ${interaction.user.tag}`);
      await interaction.reply(`🐢 Slowmode di ${ch} impostato a **${secs}s**.`);
    } catch {
      await interaction.reply({ content: '❌ Errore: verifica i miei permessi.', flags: MessageFlags.Ephemeral });
    }
  },
};
