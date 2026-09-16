const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    try {
      const cfg = getGuild(member.guild.id);
      if (!cfg.goodbyeChannelId) return;
      const ch = await member.guild.channels.fetch(cfg.goodbyeChannelId).catch(() => null);
      if (!ch?.isTextBased()) return;
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('👋 Addio!')
        .setDescription(
          (cfg.goodbyeMessage || '👋 {user} ha lasciato **{server}**.')
            .replaceAll('{user}', member.user.tag)
            .replaceAll('{server}', member.guild.name)
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await ch.send({ embeds: [embed] });
    } catch (e) {
      console.error('goodbye:', e.message);
    }
  },
};
