const { Events, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveTemp, removeTemp, isTemp } = require('../database/tempvoice');

// Lock anti-race: un solo canale in creazione per utente (doppi eventi join ravvicinati).
const creating = new Set();

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      const guildId = guild.id;

      // --- Pulizia: se una temp vocale resta vuota, eliminala ---
      try {
        const leftId = oldState.channelId;
        if (leftId && leftId !== newState.channelId && isTemp(guildId, leftId)) {
          const left = guild.channels.cache.get(leftId)
            ?? await guild.channels.fetch(leftId).catch(() => null);
          if (!left) {
            removeTemp(guildId, leftId);
          } else if ((left.members?.size ?? 0) === 0) {
            try {
              await left.delete('Vocale temporanea vuota');
            } catch (e) {
              console.error(`tempVoice: impossibile eliminare ${leftId} in ${guildId}: ${e.message}`);
            }
            removeTemp(guildId, leftId);
          }
        }
      } catch (e) {
        console.error(`tempVoice (cleanup): ${e.message}`);
      }

      // --- Creazione: entrata nella lobby ---
      try {
        const joinedId = newState.channelId;
        if (!joinedId) return;

        const cfg = getConfig(guildId);
        if (!cfg.lobbyChannelId || joinedId !== cfg.lobbyChannelId) return;

        const lockKey = `${guildId}:${member.id}`;
        if (creating.has(lockKey)) return; // creazione già in corso per questo utente
        creating.add(lockKey);
        try {
          const lobby = guild.channels.cache.get(cfg.lobbyChannelId)
            ?? await guild.channels.fetch(cfg.lobbyChannelId).catch(() => null);
          if (!lobby) return;

          const parentId = cfg.categoryId || lobby.parentId || null;
          const name = `🎧 ${member.displayName}`.slice(0, 100);

          const temp = await guild.channels.create({
            name,
            type: ChannelType.GuildVoice,
            parent: parentId,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
              },
              {
                id: member.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.Connect,
                  PermissionFlagsBits.Speak,
                  PermissionFlagsBits.ManageChannels,
                ],
              },
            ],
            reason: `Vocale temporanea di ${member.user.tag}`,
          });

          saveTemp(guildId, temp.id, { ownerId: member.id });

          try {
            await member.voice.setChannel(temp.id);
          } catch (e) {
            console.error(`tempVoice: impossibile spostare ${member.user.tag} in ${temp.id}: ${e.message}`);
          }
        } finally {
          creating.delete(lockKey);
        }
      } catch (e) {
        console.error(`tempVoice (create): ${e.message}`);
      }
    } catch (e) {
      console.error(`tempVoice: ${e.message}`);
    }
  },
};
