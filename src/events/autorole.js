const { Events } = require('discord.js');
const { getConfig } = require('../database/autorole');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      // Salta i bot (user può mancare sui GuildMember parziali: partials attivi in index.js)
      if (member?.user?.bot) return;
      if (!member?.guild) return;
      // Controller feature 'autorole' (default on, mai crashare).
      try {
        if (!require('../modules/commander').canRun(member.guild.id, 'autorole').ok) return;
      } catch {}
      const cfg = getConfig(member.guild.id);
      if (!cfg.enabled) return;
      if (!Array.isArray(cfg.roleIds) || cfg.roleIds.length === 0) return;

      const apply = async (target) => {
        for (const roleId of cfg.roleIds) {
          try {
            // Salta ID non validi e ruoli non gestibili senza sporcare i log a ogni join
            if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId)) continue;
            if (target.roles.cache.has(roleId)) continue;
            const role = target.guild.roles.cache.get(roleId);
            if (!role || role.managed || role.id === target.guild.id || !role.editable) continue;
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
