const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('lotteria');

const TICKET_PRICE = 100;
const THRESHOLD = 10;

// Formato: { [guildId]: { pot, ticketPrice, entries: { [userId]: count }, threshold } }

function defaultState() {
  return { pot: 0, ticketPrice: TICKET_PRICE, entries: {}, threshold: THRESHOLD };
}

function sanitize(state = {}) {
  const entries = {};
  if (state.entries && typeof state.entries === 'object' && !Array.isArray(state.entries)) {
    for (const [uid, count] of Object.entries(state.entries)) {
      const n = Math.floor(Number(count));
      if (typeof uid === 'string' && uid && Number.isInteger(n) && n > 0) {
        entries[uid] = Math.min(n, Number.MAX_SAFE_INTEGER);
      }
    }
  }
  const ticketPrice = Math.floor(Number(state.ticketPrice));
  const threshold = Math.floor(Number(state.threshold));
  const pot = Math.floor(Number(state.pot));
  return {
    pot: Number.isInteger(pot) && pot >= 0 ? Math.min(pot, Number.MAX_SAFE_INTEGER) : 0,
    ticketPrice: Number.isInteger(ticketPrice) && ticketPrice >= 1 ? ticketPrice : TICKET_PRICE,
    entries,
    threshold: Number.isInteger(threshold) && threshold >= 1 ? threshold : THRESHOLD,
  };
}

function getState(guildId) {
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = defaultState();
    save(FILE, db);
  }
  return sanitize(db[guildId]);
}

function persist(guildId, state) {
  const db = load(FILE);
  db[guildId] = sanitize(state);
  save(FILE, db);
  return db[guildId];
}

function validCount(count) {
  const n = Math.floor(Number(count));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function addTickets(guildId, userId, count) {
  const n = validCount(count);
  if (n === null) throw new Error('Numero di biglietti non valido (intero >= 1).');
  if (typeof userId !== 'string' || !userId) throw new Error('userId non valido.');
  const state = getState(guildId);
  state.entries[userId] = Math.min((state.entries[userId] || 0) + n, Number.MAX_SAFE_INTEGER);
  state.pot = Math.min(state.pot + n * state.ticketPrice, Number.MAX_SAFE_INTEGER);
  return persist(guildId, state);
}

function totalTickets(guildId) {
  const state = getState(guildId);
  return Object.values(state.entries).reduce((a, b) => a + b, 0);
}

function resetLottery(guildId) {
  return persist(guildId, defaultState());
}

module.exports = { TICKET_PRICE, THRESHOLD, getState, addTickets, totalTickets, resetLottery, validCount };
