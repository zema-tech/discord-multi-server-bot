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
  // Input non numerici (null/undefined/NaN) o negativi: fallback '0s' invece di 'NaNs'/'-5s'.
  if (!Number.isFinite(msValue) || msValue < 0) return '0s';
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
  // DM / partial / member mancante: niente gerarchia da verificare, non lanciare.
  const requesterPos = interaction?.member?.roles?.highest?.position;
  const targetPos = targetMember?.roles?.highest?.position;
  if (!Number.isFinite(requesterPos) || !Number.isFinite(targetPos)) return true;
  if (interaction?.guild?.ownerId !== undefined && interaction.guild.ownerId === interaction?.user?.id) return true;
  return requesterPos > targetPos;
}

module.exports = { baseEmbed, sendLog, formatDuration, hierarchyAllows };
