const { EmbedBuilder } = require('discord.js');

function baseEmbed() {
  return new EmbedBuilder().setColor(0x5865f2).setTimestamp();
}

async function sendLog(guild, embedData) {
  try {
    const { getGuild } = require('../database/guildConfig');
    const cfg = getGuild(guild.id);
    if (!cfg.logChannelId) return;
    const ch = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!ch?.isTextBased()) return;
    await ch.send(embedData);
  } catch (e) {
    console.error('sendLog:', e.message);
  }
}

function formatDuration(msValue) {
  const s = Math.floor(msValue / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}g`;
}

function hierarchyAllows(interaction, targetMember) {
  if (!targetMember) return true;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return interaction.member.roles.highest.position > targetMember.roles.highest.position;
}

module.exports = { baseEmbed, sendLog, formatDuration, hierarchyAllows };
