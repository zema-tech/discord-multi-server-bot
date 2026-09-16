const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ Bot online come ${client.user.tag}`);
    console.log(`📡 Presente su ${client.guilds.cache.size} server`);

    client.user.setActivity(`${client.guilds.cache.size} server | /help`, {
      type: ActivityType.Watching,
    });
  },
};
