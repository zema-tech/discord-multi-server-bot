const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informazioni su un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    let member = interaction.guild.members.cache.get(user.id);
    if (!member) member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const badges = [];
    if (user.id === interaction.guild.ownerId) badges.push('👑 Owner');
    if (user.bot) badges.push('🤖 Bot');
    if (member?.premiumSinceTimestamp) badges.push('💎 Booster');
    if (member?.permissions.has('Administrator')) badges.push('🛡️ Admin');
    else if (member?.permissions.has('ManageGuild') || member?.permissions.has('ManageMessages')) badges.push('🧰 Staff');
    let joinPos = null;
    if (member?.joinedTimestamp) {
      const sorted = [...interaction.guild.members.cache.values()]
        .filter((m) => m.joinedTimestamp)
        .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
      const idx = sorted.findIndex((m) => m.id === member.id);
      if (idx >= 0) joinPos = `#${idx + 1} su ${sorted.length}`;
    }
    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor || 0x5865f2)
      .setTitle(`👤 ${user.tag}`)
      .setDescription(badges.length ? badges.join(' • ') : '👤 Membro')
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
        { name: '🤖 Bot', value: user.bot ? 'Sì' : 'No', inline: true },
        { name: '📅 Account creato', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`, inline: true }
      );
    if (member) {
      const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id);
      const rolesText = roles.size
        ? roles.sort((a, b) => b.position - a.position).map((r) => `${r}`).join(' ').slice(0, 1024)
        : 'Nessuno';
      embed.addFields(
        { name: '📥 Entrato nel server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)${joinPos ? `\n🏅 Posizione d'ingresso: **${joinPos}**` : ''}`, inline: true },
        { name: '🎭 Ruolo principale', value: `${member.roles.highest}`, inline: true },
        { name: `🎭 Ruoli (${roles.size})`, value: rolesText }
      );
      if (member.premiumSinceTimestamp) {
        embed.addFields({ name: '💎 Boost dal', value: `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`, inline: true });
      }
    }
    embed.setFooter({ text: `${user.tag} • ${user.id}`.slice(0, 200) }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
