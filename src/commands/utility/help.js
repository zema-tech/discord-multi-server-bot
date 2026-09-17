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
      utility: '🔧 Utility', levels: '⭐ Livelli', tickets: '🎫 Ticket', ai: '🤖 AI', altri: '📌 Altri',
    };
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📚 Comandi — ${interaction.client.user.username}`)
      .setDescription(`✨ **${client.commands.size} comandi** su **${interaction.client.guilds.cache.size}** server\n_Scegli una categoria qui sotto: ogni riga è pronta da copiare!_`);
    for (const [cat, list] of Object.entries(byFolder)) {
      const sorted = list.sort();
      const label = `${titles[cat] || `📌 ${cat}`} (${sorted.length})`;
      embed.addFields({ name: label, value: sorted.join(' ').slice(0, 1024) || '—' });
    }
    const baseUrl = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
    const footerText = baseUrl
      ? `Usa /setup per configurare il server • Dashboard: ${baseUrl}`
      : 'Usa /setup per configurare welcome, log e automod';
    embed.setFooter({ text: footerText.slice(0, 200) }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
