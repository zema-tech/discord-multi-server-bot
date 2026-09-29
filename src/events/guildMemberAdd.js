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
      // Controller feature 'utility' per i messaggi di benvenuto (default on).
      try {
        if (!require('../modules/commander').canRun(member.guild.id, 'utility').ok) return;
      } catch {}
      const ch = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
      if (!ch?.isTextBased?.()) return;
      const text = fill(cfg.welcomeMessage, member);
      const avatar = cfg.welcomeThumbnail === false ? null : member.user?.displayAvatarURL?.();
      if (cfg.welcomeStyle === 'text') {
        await ch.send({ content: `${member} ${text}`.slice(0, 2000) });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(cfg.welcomeColor || 0x57f287)
        .setTitle(`👋 Benvenuto su ${member.guild.name}!`)
        .setDescription(text)
        .setTimestamp();
      if (avatar) embed.setThumbnail(avatar);
      await ch.send({ content: `${member}`, embeds: [embed] });
    } catch (e) {
      console.error('welcome:', e.message);
    }
  },
};
