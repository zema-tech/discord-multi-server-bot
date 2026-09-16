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
  return guildData(guildId).config;
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

module.exports = {
  TICKET_TYPES,
  getConfig,
  setConfig,
  nextNumber,
  saveTicket,
  getTicket,
  getUserOpenTickets,
  getStats,
};
