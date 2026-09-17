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
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const secs = interaction.options.getInteger('secondi');
    const ch = interaction.options.getChannel('canale') || interaction.channel;
    if (!ch?.isTextBased?.() || typeof ch.setRateLimitPerUser !== 'function') {
      return interaction.reply({ content: '❌ Lo slowmode funziona solo nei canali testuali.', flags: MessageFlags.Ephemeral });
    }
    try {
      await ch.setRateLimitPerUser(secs, `Slowmode ${secs}s | Mod: ${interaction.user.tag}`);
      await interaction.reply(`🐢 Slowmode di ${ch} impostato a **${secs}s**.`);
    } catch {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Errore: verifica i miei permessi.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Errore: verifica i miei permessi.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
