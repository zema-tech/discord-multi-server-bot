const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Mostra la latenza del bot'),
  cooldown: 3,
  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pong!', withResponse: true });
    const rtt = sent.resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong!\n📡 Latenza: **${rtt}ms** | WebSocket: **${interaction.client.ws.ping}ms**`);
  },
};
