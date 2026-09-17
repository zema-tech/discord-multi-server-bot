const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ Bot online come ${client.user.tag}`);
    console.log(`📡 Presente su ${client.guilds.cache.size} server`);
    console.log(`📦 Comandi: ${client.commands.size}`);

    const update = () =>
      client.user.setActivity(`${client.guilds.cache.size} server | /help`, { type: ActivityType.Watching }).catch(() => {});
    update();
    setInterval(update, 10 * 60 * 1000).unref?.();

    // PEAK: auto-chiusura ticket inattivi ogni 15 minuti (interval con unref dentro il job).
    try {
      require('../jobs/ticketAutoclose').startTicketAutoclose(client);
    } catch (e) {
      console.error('ticketAutoclose:', e.message);
    }

    // BACKUP: copia notturna del database ore 03:00 (interval con unref dentro il job).
    try {
      require('../jobs/backup').startBackup(client);
    } catch (e) {
      console.error('backup:', e.message);
    }

    // SELF: auto-miglioramento notturno (attivo solo con SELF_IMPROVE=1).
    try {
      require('../jobs/selfImprove').startSelfImprove(client);
    } catch (e) {
      console.error('selfImprove:', e.message);
    }
  },
};
