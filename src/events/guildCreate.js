'use strict';
/**
 * src/events/guildCreate.js — Il bot entra in un server: aggiorna il roster
 * per la dashboard standalone (best-effort, mai rompere il flusso).
 */
module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    try {
      require('../dashboard/presence').writePresence(guild && guild.client);
    } catch { /* presence non critica */ }
  },
};
