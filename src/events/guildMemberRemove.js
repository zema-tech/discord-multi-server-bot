const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    try {
      if (!member?.guild) return;
      const cfg = getGuild(member.guild.id);
      if (!cfg.goodbyeChannelId) return;
      const ch = await member.guild.channels.fetch(cfg.goodbyeChannelId).catch(() => null);
      if (!ch?.isTextBased?.()) return;
      const text = (cfg.goodbyeMessage || '👋 {user} ha lasciato **{server}**.')
        .replaceAll('{user}', member.user?.tag ?? 'un utente')
        .replaceAll('{server}', member.guild?.name ?? 'il server');
      const avatar = cfg.goodbyeThumbnail === false ? null : member.user?.displayAvatarURL?.();
      if (cfg.goodbyeStyle === 'text') {
        await ch.send({ content: text.slice(0, 2000) });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(cfg.goodbyeColor || 0xed4245)
        .setTitle('👋 Addio!')
        .setDescription(text)
        .setTimestamp();
      if (avatar) embed.setThumbnail(avatar);
      await ch.send({ embeds: [embed] });
    } catch (e) {
      console.error('goodbye:', e.message);
    }
  },
};
