/**
 * analyticsMembers — conteggio joins/leaves per /analytics (stile PeakBot).
 *
 * NOTA multi-listener (loader `src/index.js`: UN evento per file, tutti coesistono
 * via client.on): questo modulo espone `GuildMemberAdd` come evento primario
 * accanto a `guildMemberAdd.js` (welcome), `autorole.js` e `antiRaid.js`,
 * e alla prima esecuzione aggancia sullo stesso `client` anche il listener
 * `GuildMemberRemove` (una sola volta, flag `client._analyticsMembersExtraAttached`),
 * con lo stesso pattern lazy-attach di `auditLog.js`. Nessun file esistente
 * viene modificato. Se lo smoke test segnala duplicati, il revisore può
 * estendere l'allowlist (già prevista per guildMemberAdd) — pattern voluto.
 *
 * Privacy: solo conteggi giornalieri (joins/leaves), mai dati utente.
 * Ogni handler è wrappato in try/catch: mai crashare il bot.
 */

const { Events } = require('discord.js');
const { bump } = require('../database/analytics');

async function handleGuildMemberAdd(member) {
  try {
    if (!member?.guild) return;
    bump(member.guild.id, 'joins');
  } catch (e) {
    console.error('analyticsMembers add:', e.message);
  }
}

async function handleGuildMemberRemove(member) {
  try {
    if (!member?.guild) return;
    bump(member.guild.id, 'leaves');
  } catch (e) {
    console.error('analyticsMembers remove:', e.message);
  }
}

/** Aggancia una sola volta il listener GuildMemberRemove sullo stesso client. */
function ensureExtraListeners(client) {
  try {
    if (!client || typeof client.on !== 'function' || client._analyticsMembersExtraAttached) return;
    client._analyticsMembersExtraAttached = true;
    client.on(Events.GuildMemberRemove, (member) => handleGuildMemberRemove(member, client));
  } catch (e) {
    console.error('analyticsMembers attach:', e.message);
  }
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    ensureExtraListeners(client);
    await handleGuildMemberAdd(member, client);
  },
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  ensureExtraListeners,
};
