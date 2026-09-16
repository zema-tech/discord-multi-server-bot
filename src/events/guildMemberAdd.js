const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');

function fill(template, member) {
  return template
    .replaceAll('{user}', `${member}`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', `${member.guild.memberCount}`);
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      const cfg = getGuild(member.guild.id);
      if (!cfg.welcomeChannelId) return;
      const ch = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
      if (!ch?.isTextBased()) return;
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`👋 Benvenuto su ${member.guild.name}!`)
        .setDescription(fill(cfg.welcomeMessage, member))
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await ch.send({ content: `${member}`, embeds: [embed] });
    } catch (e) {
      console.error('welcome:', e.message);
    }
  },
};
