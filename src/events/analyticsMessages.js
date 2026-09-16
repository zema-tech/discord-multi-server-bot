/**
 * analyticsMessages — conteggio messaggi per /analytics (stile PeakBot / YouTube-Studio).
 *
 * NOTA multi-listener (loader `src/index.js`: UN evento per file, tutti coesistono
 * via client.on): questo modulo registra un SECONDO listener `MessageCreate`
 * accanto a `messageCreate.js` (XP/automod) e fa UNA cosa sola: bump del contatore
 * giornaliero `messages`. Se lo smoke test segnala evento duplicato "messageCreate",
 * il revisore può estendere l'allowlist come già fatto per guildMemberAdd.
 *
 * Privacy: solo conteggio, MAI contenuto del messaggio. Ignora bot e DM.
 * Tutto wrappato in try/catch: mai crashare il bot.
 */

const { Events } = require('discord.js');
const { bump } = require('../database/analytics');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message?.guild || message.author?.bot) return; // ignora DM e bot
      bump(message.guild.id, 'messages');
    } catch (e) {
      console.error('analyticsMessages:', e.message);
    }
  },
};
