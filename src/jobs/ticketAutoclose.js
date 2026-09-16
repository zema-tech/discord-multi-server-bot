// ticketAutoclose.js — chiusura automatica ticket inattivi (stile PeakBot).
//
// NOTA PER IL FUTURO COLLEGAMENTO A `/ticket setup` (comando di un altro agente):
//   - esporre un sottocomando tipo `/ticket setup autoclose <giorni>` (0 = disattivato)
//     che chiami `setAutoClose(guildId, days)` qui sotto;
//   - in alternativa `/ticket autoclose giorni:<n>` con permessi ManageGuild;
//   - `ready.js` avvia già `startTicketAutoclose(client)` ogni 15 minuti.
// Nessun sottocomando /ticket viene creato qui per non confliggere con l'altro agente.

const { getConfig, setConfig, saveTicket } = require('../database/tickets');
const { doClose } = require('../handlers/ticketHandler');

const AUTO_CLOSE_REASON = 'Chiusura automatica per inattività';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function setAutoClose(guildId, days) {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 0 || n > 90) throw new Error('Giorni non validi (0-90, 0 = disattivato).');
  return setConfig(guildId, { autoCloseDays: n }).autoCloseDays;
}

function readDbGuildIds() {
  try {
    const { load, dbFile } = require('../database/jsonDb');
    const db = load(dbFile('tickets'));
    return Object.keys(db);
  } catch {
    return [];
  }
}

async function checkOnce(client) {
  const closed = [];
  const guildIds = new Set([...(client.guilds?.cache?.keys() || []), ...readDbGuildIds()]);

  for (const guildId of guildIds) {
    let config;
    try {
      config = getConfig(guildId);
    } catch {
      continue;
    }
    const days = Math.floor(Number(config.autoCloseDays));
    if (!Number.isFinite(days) || days <= 0) continue; // 0 = off (default)

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    let db;
    try {
      const { load, dbFile } = require('../database/jsonDb');
      db = load(dbFile('tickets'));
    } catch {
      continue;
    }
    const tickets = Object.values(db[guildId]?.tickets || {}).filter((t) => t && t.status === 'open');
    const threshold = days * MS_PER_DAY;
    const now = Date.now();

    for (const ticket of tickets) {
      const lastActivity = Number.isFinite(ticket.lastActivityAt) ? ticket.lastActivityAt
        : Number.isFinite(ticket.createdAt) ? ticket.createdAt : now;
      if (now - lastActivity < threshold) continue;

      try {
        const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
        if (!channel) continue; // canale eliminato: salto senza crashare il ciclo
        const botUser = client.user;
        await doClose(channel, guild, ticket, botUser, AUTO_CLOSE_REASON);
        closed.push({ guildId, channelId: ticket.channelId, number: ticket.number });
      } catch (e) {
        console.error(`ticketAutoclose #${ticket.number}:`, e.message);
      }
    }
  }
  return closed;
}

function startTicketAutoclose(client, intervalMs = 15 * 60 * 1000) {
  // Prima passata ritardata di 60s per non rallentare il boot.
  const t = setTimeout(() => checkOnce(client).catch((e) => console.error('ticketAutoclose:', e)), 60 * 1000);
  t.unref?.();
  const iv = setInterval(() => checkOnce(client).catch((e) => console.error('ticketAutoclose:', e)), intervalMs);
  iv.unref?.();
  return iv;
}

module.exports = { startTicketAutoclose, checkOnce, setAutoClose, AUTO_CLOSE_REASON };
