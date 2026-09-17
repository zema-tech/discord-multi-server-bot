const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

function boostBar(count) {
  const max = 14;
  const filled = Math.max(0, Math.min(10, Math.round((Math.min(count, max) / max) * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informazioni sul server'),
  cooldown: 5,
  async execute(interaction) {
    const g = interaction.guild;
    if (!g) return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    const channels = g.channels.cache;
    const text = channels.filter((c) => c.isTextBased && c.isTextBased() && !c.isThread?.()).size;
    const voice = channels.filter((c) => c.type === 2).size;
    const cats = channels.filter((c) => c.type === 4).size;
    const threads = channels.filter((c) => c.isThread?.()).size;
    const emojiCount = g.emojis.cache.size;
    const stickerCount = g.stickers.cache.size;
    const boosts = g.premiumSubscriptionCount || 0;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏰 ${g.name}`)
      .setDescription(`✨ **Livello boost ${g.premiumTier}** ${boostBar(boosts)} \`${boosts}/14\`\n👑 Proprietario: <@${g.ownerId}> • 🆔 \`${g.id}\``);
    // Server senza icona: iconURL() è null e setThumbnail(null) lancia.
    const icon = g.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);
    const banner = g.bannerURL ? g.bannerURL({ size: 1024 }) : null;
    if (banner) embed.setImage(banner);
    embed.addFields(
        { name: '👥 Membri', value: `**${g.memberCount}**`, inline: true },
        { name: '💬 Canali', value: `Testuali **${text}** • Vocali **${voice}**\nCategorie **${cats}**${threads ? ` • Thread **${threads}**` : ''}`, inline: true },
        { name: '🎭 Ruoli', value: `**${g.roles.cache.size}**`, inline: true },
        { name: '😀 Emoji / Sticker', value: `Emoji **${emojiCount}** • Sticker **${stickerCount}**`, inline: true },
        { name: '🚀 Boost', value: `Livello **${g.premiumTier}** (${boosts} boost)`, inline: true },
        { name: '📅 Creato', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D> (<t:${Math.floor(g.createdTimestamp / 1000)}:R>)`, inline: true }
      )
      .setFooter({ text: `${g.name} • ID ${g.id}`.slice(0, 200) })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
