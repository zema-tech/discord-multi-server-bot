const { Events } = require('discord.js');
const { getConfig } = require('../database/autorole');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      // Salta i bot
      if (member.user.bot) return;
      const cfg = getConfig(member.guild.id);
      if (!cfg.enabled) return;
      if (!Array.isArray(cfg.roleIds) || cfg.roleIds.length === 0) return;

      const apply = async (target) => {
        for (const roleId of cfg.roleIds) {
          try {
            if (target.roles.cache.has(roleId)) continue;
            await target.roles.add(roleId);
          } catch (e) {
            console.error(`autorole: impossibile assegnare il ruolo ${roleId} a ${target.user.tag} in ${target.guild.id}: ${e.message}`);
          }
        }
      };

      const delay = Math.max(0, Number(cfg.delaySeconds) || 0);
      if (delay > 0) {
        setTimeout(async () => {
          try {
            const fresh = await member.guild.members.fetch(member.id).catch(() => null);
            if (!fresh) return;
            await apply(fresh);
          } catch (e) {
            console.error('autorole:', e.message);
          }
        }, delay * 1000)?.unref?.();
      } else {
        await apply(member);
      }
    } catch (e) {
      console.error('autorole:', e.message);
    }
  },
};
