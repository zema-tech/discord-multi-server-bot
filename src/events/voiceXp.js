const { Events } = require('discord.js');
const { addXp } = require('../database/levels');
const { rewardsUpTo } = require('../database/levelRewards');

const XP_PER_MINUTE = 5;
const MAX_XP_PER_SESSION = 300;

// join-time in memoria: `${guildId}:${userId}` -> timestamp
const joinTimes = new Map();

function trackKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function isXpEligible(member, state) {
  if (!member || member.user.bot) return false;
  if (state.mute || state.deaf || state.selfMute || state.selfDeaf || state.serverMute || state.serverDeaf) return false;
  return true;
}

async function grantVoiceRewards(member, newLevel) {
  let rewards = [];
  try {
    rewards = rewardsUpTo(member.guild.id, newLevel);
  } catch {
    return;
  }
  for (const r of rewards) {
    try {
      if (member.roles.cache.has(r.roleId)) continue;
      const role = await member.guild.roles.fetch(r.roleId).catch(() => null);
      if (!role || !role.editable) continue;
      await member.roles.add(role).catch(() => {});
    } catch {
      // Mai crashare il flusso XP per un singolo ruolo.
    }
  }
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    try {
      const guildId = (newState.guild || oldState.guild)?.id;
      const userId = (newState.member || oldState.member)?.id;
      if (!guildId || !userId) return;

      const joinedChannelId = newState.channelId;
      const leftChannelId = oldState.channelId;

      // Cambio canale (spostamento): mantieni il join-time originale.
      if (joinedChannelId && leftChannelId && joinedChannelId !== leftChannelId) return;

      if (joinedChannelId && !leftChannelId) {
        // Entrata in vocale.
        joinTimes.set(trackKey(guildId, userId), Date.now());
        if (joinTimes.size > 5000) {
          const cutoff = Date.now() - 6 * 60 * 60 * 1000;
          for (const [k, t] of joinTimes) if (t < cutoff) joinTimes.delete(k);
        }
        return;
      }

      if (!joinedChannelId && leftChannelId) {
        // Uscita dalla vocale.
        const key = trackKey(guildId, userId);
        const joinedAt = joinTimes.get(key);
        joinTimes.delete(key);
        if (!joinedAt) return;

        const member = newState.member || oldState.member;
        // Ignora bot e sessioni in muto/deafen: verifica stato finale + durata minima.
        if (!member || member.user.bot) return;
        if (oldState.mute || oldState.deaf || oldState.selfMute || oldState.selfDeaf || oldState.serverMute || oldState.serverDeaf) return;

        const minutes = Math.floor((Date.now() - joinedAt) / 60000);
        if (minutes < 1) return;
        const xp = Math.min(minutes * XP_PER_MINUTE, MAX_XP_PER_SESSION);
        let res;
        try {
          res = addXp(guildId, userId, xp);
        } catch {
          return;
        }
        // Levelup vocale silenzioso: nessun messaggio, solo eventuale ruolo premio.
        if (res && res.leveledUp) {
          try {
            const fullMember = await newState.guild.members.fetch(userId).catch(() => null);
            if (fullMember) await grantVoiceRewards(fullMember, res.level);
          } catch {}
        }
      }
    } catch {}
  },
};
