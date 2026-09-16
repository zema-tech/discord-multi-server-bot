const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('tickets');

const TICKET_TYPES = {
  supporto: { label: 'Supporto', emoji: '🛠️', descrizione: 'Assistenza generale e domande' },
  bug: { label: 'Bug / Problema tecnico', emoji: '🐛', descrizione: 'Segnala un malfunzionamento' },
  appeal: { label: 'Appeal / Sban', emoji: '⚖️', descrizione: 'Contesta un provvedimento' },
  partnership: { label: 'Partnership', emoji: '🤝', descrizione: 'Proponi una collaborazione' },
};

const DEFAULT_CONFIG = {
  panelChannelId: null,
  categoryId: null,
  logChannelId: null,
  supportRoleIds: [],
  maxPerUser: 3,
  // PEAK: giorni di inattività prima della chiusura automatica (0 = disattivato).
  autoCloseDays: 0,
};

function guildData(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = { config: { ...DEFAULT_CONFIG, supportRoleIds: [] }, counter: 0, tickets: {} };
    save(FILE, db);
  }
  return db[guildId];
}

function persist(guildId, data) {
  const db = load(FILE);
  db[guildId] = data;
  save(FILE, db);
}

function getConfig(guildId) {
  // PEAK: backfill additivo per config create prima di autoCloseDays.
  const config = guildData(guildId).config;
  if (config.autoCloseDays === undefined) config.autoCloseDays = 0;
  return config;
}

function setConfig(guildId, patch) {
  const data = guildData(guildId);
  data.config = { ...data.config, ...patch };
  persist(guildId, data);
  return data.config;
}

function nextNumber(guildId) {
  const data = guildData(guildId);
  data.counter += 1;
  persist(guildId, data);
  return data.counter;
}

function saveTicket(guildId, ticket) {
  const data = guildData(guildId);
  // PEAK: init additiva lastActivityAt (i ticket preesistenti senza campo usano createdAt come fallback).
  if (ticket && ticket.lastActivityAt === undefined) ticket.lastActivityAt = Date.now();
  data.tickets[ticket.channelId] = ticket;
  persist(guildId, data);
  return ticket;
}

function getTicket(guildId, channelId) {
  return guildData(guildId).tickets[channelId] || null;
}

function getUserOpenTickets(guildId, userId) {
  return Object.values(guildData(guildId).tickets).filter(
    (t) => t.ownerId === userId && t.status === 'open'
  );
}

function getStats(guildId) {
  const tickets = Object.values(guildData(guildId).tickets);
  return {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    closed: tickets.filter((t) => t.status === 'closed').length,
    byType: tickets.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

// PEAK: aggiorna lastActivityAt di un ticket aperto (throttle 60s per non salvare a ogni messaggio).
function touchActivity(guildId, channelId, now = Date.now()) {
  const ticket = getTicket(guildId, channelId);
  if (!ticket || ticket.status !== 'open') return false;
  const last = Number.isFinite(ticket.lastActivityAt) ? ticket.lastActivityAt : 0;
  if (now - last < 60000) return false;
  ticket.lastActivityAt = now;
  saveTicket(guildId, ticket);
  return true;
}

module.exports = {
  TICKET_TYPES,
  getConfig,
  setConfig,
  nextNumber,
  saveTicket,
  getTicket,
  getUserOpenTickets,
  getStats,
  touchActivity, // PEAK
};
