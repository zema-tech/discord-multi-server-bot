const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');

function fill(template, member) {
  return String(template || '')
    .replaceAll('{user}', `${member}`)
    .replaceAll('{username}', member.user?.username ?? 'utente')
    .replaceAll('{server}', member.guild?.name ?? 'il server')
    .replaceAll('{count}', `${member.guild?.memberCount ?? '?'}`);
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      if (!member?.guild) return;
      const cfg = getGuild(member.guild.id);
      if (!cfg.welcomeChannelId) return;
      const ch = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
      if (!ch?.isTextBased?.()) return;
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`👋 Benvenuto su ${member.guild.name}!`)
        .setDescription(fill(cfg.welcomeMessage, member))
        .setTimestamp();
      const avatar = member.user?.displayAvatarURL?.();
      if (avatar) embed.setThumbnail(avatar);
      await ch.send({ content: `${member}`, embeds: [embed] });
    } catch (e) {
      console.error('welcome:', e.message);
    }
  },
};
