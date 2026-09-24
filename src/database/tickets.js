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
  if (!guildId) {
    // Niente record fantasma 'undefined'/'null': default in memoria, senza save.
    return { config: { ...DEFAULT_CONFIG, supportRoleIds: [] }, counter: 0, tickets: {} };
  }
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) {
    db[guildId] = { config: { ...DEFAULT_CONFIG, supportRoleIds: [] }, counter: 0, tickets: {} };
    save(FILE, db);
  }
  const g = db[guildId];
  // Ripara shape corrotto invece di propagarlo (counter stringa/NaN, tickets array, config array).
  if (!g.config || typeof g.config !== 'object' || Array.isArray(g.config)) {
    g.config = { ...DEFAULT_CONFIG, supportRoleIds: [] };
  }
  const c = Math.floor(Number(g.counter));
  g.counter = Number.isFinite(c) && c >= 0 ? Math.min(c, Number.MAX_SAFE_INTEGER) : 0;
  if (!g.tickets || typeof g.tickets !== 'object' || Array.isArray(g.tickets)) g.tickets = {};
  return g;
}

function persist(guildId, data) {
  if (!guildId) return;
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

function asIdOrNull(v) {
  return typeof v === 'string' && v ? v : null;
}

function sanitizePatch(patch) {
  const out = {};
  if (patch.panelChannelId !== undefined) out.panelChannelId = asIdOrNull(patch.panelChannelId);
  if (patch.categoryId !== undefined) out.categoryId = asIdOrNull(patch.categoryId);
  if (patch.logChannelId !== undefined) out.logChannelId = asIdOrNull(patch.logChannelId);
  if (patch.supportRoleIds !== undefined) {
    out.supportRoleIds = Array.isArray(patch.supportRoleIds)
      ? patch.supportRoleIds.filter((r) => typeof r === 'string' && r)
      : [];
  }
  if (patch.maxPerUser !== undefined) {
    const n = Math.floor(Number(patch.maxPerUser));
    out.maxPerUser = Number.isFinite(n) ? Math.min(Math.max(1, n), 20) : DEFAULT_CONFIG.maxPerUser;
  }
  if (patch.autoCloseDays !== undefined) {
    const n = Math.floor(Number(patch.autoCloseDays));
    out.autoCloseDays = Number.isFinite(n) ? Math.min(Math.max(0, n), 365) : DEFAULT_CONFIG.autoCloseDays;
  }
  return out;
}

function setConfig(guildId, patch) {
  const data = guildData(guildId);
  data.config = { ...data.config, ...sanitizePatch(patch && typeof patch === 'object' ? patch : {}) };
  persist(guildId, data);
  return data.config;
}

function nextNumber(guildId) {
  const data = guildData(guildId);
  data.counter = Math.min(data.counter + 1, Number.MAX_SAFE_INTEGER);
  persist(guildId, data);
  return data.counter;
}

function saveTicket(guildId, ticket) {
  // channelId mancante/non-stringa: niente chiave 'undefined', ritorna null.
  if (!ticket || typeof ticket !== 'object' || typeof ticket.channelId !== 'string' || !ticket.channelId) return null;
  const data = guildData(guildId);
  // PEAK: init additiva lastActivityAt (i ticket preesistenti senza campo usano createdAt come fallback).
  if (ticket && ticket.lastActivityAt === undefined) ticket.lastActivityAt = Date.now();
  data.tickets[ticket.channelId] = normalizeTicket(ticket);
  persist(guildId, data);
  return ticket;
}

const PRIORITIES = ['bassa', 'normale', 'alta', 'urgente'];
const MAX_NOTES = 20;
const MAX_NOTE_CHARS = 500;
const MAX_SUBJECT_CHARS = 120;

/** Backfill additivo: i ticket vecchi ottengono i campi nuovi con default. */
function normalizeTicket(t) {
  if (!t || typeof t !== 'object') return t;
  if (!PRIORITIES.includes(t.priority)) t.priority = 'normale';
  if (typeof t.subject !== 'string') t.subject = null;
  else if (!t.subject.trim()) t.subject = null;
  else t.subject = t.subject.trim().slice(0, MAX_SUBJECT_CHARS);
  if (!Array.isArray(t.notes)) t.notes = [];
  t.notes = t.notes
    .filter((n) => n && typeof n === 'object' && typeof n.text === 'string' && n.text.trim())
    .slice(-MAX_NOTES)
    .map((n) => ({
      by: typeof n.by === 'string' ? n.by : null,
      text: n.text.trim().slice(0, MAX_NOTE_CHARS),
      at: Number.isFinite(n.at) ? n.at : Date.now(),
    }));
  if (!t.rating || typeof t.rating !== 'object' || ![1, 2, 3, 4, 5].includes(t.rating.score)) {
    t.rating = null;
  }
  return t;
}

/** Imposta la priorità. Lancia su valore non valido. Ritorna il ticket. */
function setPriority(guildId, channelId, priority) {
  const p = String(priority || '').toLowerCase().trim();
  if (!PRIORITIES.includes(p)) throw new Error(`Priorità non valida (${PRIORITIES.join('/')}).`);
  const data = guildData(guildId);
  const t = data.tickets[channelId];
  if (!t) return null;
  t.priority = p;
  persist(guildId, data);
  return t;
}

/** Imposta l'oggetto (stringa vuota = rimuovi). Ritorna il ticket o null. */
function setSubject(guildId, channelId, subject) {
  const data = guildData(guildId);
  const t = data.tickets[channelId];
  if (!t) return null;
  const s = String(subject || '').trim();
  t.subject = s ? s.slice(0, MAX_SUBJECT_CHARS) : null;
  persist(guildId, data);
  return t;
}

/** Aggiunge una nota staff. Lancia su testo vuoto o cap raggiunto. */
function addNote(guildId, channelId, by, text) {
  const data = guildData(guildId);
  const t = data.tickets[channelId];
  if (!t) return null;
  const clean = String(text || '').trim().slice(0, MAX_NOTE_CHARS);
  if (!clean) throw new Error('Nota vuota.');
  const notes = Array.isArray(t.notes) ? t.notes : [];
  if (notes.length >= MAX_NOTES) throw new Error(`Max ${MAX_NOTES} note per ticket.`);
  notes.push({ by: typeof by === 'string' ? by : null, text: clean, at: Date.now() });
  t.notes = notes;
  persist(guildId, data);
  return t;
}

/** Registra la valutazione del proprietario (1-5). Ritorna false se già votato. */
function setRating(guildId, channelId, score) {
  const n = Math.floor(Number(score));
  if (![1, 2, 3, 4, 5].includes(n)) throw new Error('Valutazione non valida (1-5).');
  const data = guildData(guildId);
  const t = data.tickets[channelId];
  if (!t) return null;
  if (t.rating && [1, 2, 3, 4, 5].includes(t.rating.score)) return false;
  t.rating = { score: n, at: Date.now() };
  persist(guildId, data);
  return true;
}

function getTicket(guildId, channelId) {
  if (!channelId) return null;
  const t = guildData(guildId).tickets[channelId] || null;
  return t ? normalizeTicket({ ...t }) : null;
}

function openTickets(guildId) {
  // Salta entry corrotte (null/non-oggetto) invece di lanciare su .ownerId/.status.
  return Object.values(guildData(guildId).tickets).filter((t) => t && typeof t === 'object');
}

function getUserOpenTickets(guildId, userId) {
  return openTickets(guildId).filter((t) => t.ownerId === userId && t.status === 'open');
}

function getStats(guildId) {
  const tickets = openTickets(guildId);
  const closed = tickets.filter((t) => t.status === 'closed');
  const durations = closed
    .map((t) => (Number.isFinite(t.closedAt) && Number.isFinite(t.createdAt) ? t.closedAt - t.createdAt : null))
    .filter((d) => d !== null && d >= 0);
  const ratings = tickets
    .map((t) => (t.rating && [1, 2, 3, 4, 5].includes(t.rating.score) ? t.rating.score : null))
    .filter((s) => s !== null);
  return {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    closed: closed.length,
    byType: tickets.reduce((acc, t) => {
      const k = typeof t.type === 'string' && t.type ? t.type : 'sconosciuto';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    avgCloseMin: durations.length ? Math.max(1, Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)) : null,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratingsCount: ratings.length,
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

// Rimuove un ticket orfano (es. canale eliminato). Ritorna true se esisteva.
function removeTicket(guildId, channelId) {
  if (!channelId) return false;
  const data = guildData(guildId);
  if (!data.tickets[channelId]) return false;
  delete data.tickets[channelId];
  persist(guildId, data);
  return true;
}

module.exports = {
  TICKET_TYPES,
  PRIORITIES,
  MAX_NOTES,
  MAX_SUBJECT_CHARS,
  getConfig,
  setConfig,
  nextNumber,
  saveTicket,
  getTicket,
  removeTicket,
  getUserOpenTickets,
  getStats,
  setPriority,
  setSubject,
  addNote,
  setRating,
  touchActivity, // PEAK
};
