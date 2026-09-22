const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`✅ Bot online come ${client.user.tag}`);
    console.log(`📡 Presente su ${client.guilds.cache.size} server`);
    console.log(`📦 Comandi: ${client.commands.size}`);

    // setActivity in discord.js v14 NON restituisce una Promise: niente .catch, solo try/catch.
    const update = () => {
      try {
        client.user.setActivity(`${client.guilds.cache.size} server | /help`, { type: ActivityType.Watching });
      } catch (e) { /* presenza non critica */ }
    };
    update();
    setInterval(update, 10 * 60 * 1000).unref?.();

    // PRESENCE: roster guild per la dashboard standalone (processo separato).
    // Best-effort: la dashboard legge dallo store condiviso (vedi dashboard/presence.js).
    const writePresence = () => {
      try {
        require('../dashboard/presence').writePresence(client);
      } catch (e) { /* presence non critica */ }
    };
    writePresence();
    const presenceTimer = setInterval(writePresence, 10 * 60 * 1000);
    if (typeof presenceTimer.unref === 'function') presenceTimer.unref();

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
