const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra la lista di tutti i comandi disponibili'),
  cooldown: 5,
  async execute(interaction, client) {
    const byFolder = {};
    for (const [, cmd] of client.commands) {
      const file = cmd.category || 'altri';
      if (!byFolder[file]) byFolder[file] = [];
      byFolder[file].push(`\`/${cmd.data.name}\``);
    }
    const titles = {
      moderation: '🛡️ Moderazione', fun: '🎮 Divertimento', economy: '💰 Economia',
      utility: '🔧 Utility', levels: '⭐ Livelli', tickets: '🎫 Ticket', altri: '📌 Altri',
    };
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📚 Comandi — ${interaction.client.user.username}`)
      .setDescription(`**${client.commands.size} comandi** su ${interaction.client.guilds.cache.size} server`);
    for (const [cat, list] of Object.entries(byFolder)) {
      embed.addFields({ name: titles[cat] || cat, value: list.sort().join(' ') });
    }
    embed.setFooter({ text: 'Usa /setup per configurare welcome, log e automod' }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
