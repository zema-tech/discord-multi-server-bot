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
  // OPEN-TICKET style: giorni dopo la chiusura prima di eliminare il canale (0 = off).
  autoDeleteDays: 0,
  blacklist: [],
  // PRO: pannelli pubblicati per sezione + domande pre-apertura per tipo.
  panels: [],
  questions: {},
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
  if (!Array.isArray(config.panels)) config.panels = [];
  if (!config.questions || typeof config.questions !== 'object' || Array.isArray(config.questions)) config.questions = {};
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
  if (patch.autoDeleteDays !== undefined) {
    const n = Math.floor(Number(patch.autoDeleteDays));
    out.autoDeleteDays = Number.isFinite(n) ? Math.min(Math.max(0, n), 90) : DEFAULT_CONFIG.autoDeleteDays;
  }
  if (patch.blacklist !== undefined) {
    out.blacklist = Array.isArray(patch.blacklist)
      ? [...new Set(patch.blacklist.filter((r) => typeof r === 'string' && r))].slice(0, 200)
      : [];
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
// PRO: domande pre-apertura (max 4 per tipo, 200 char l'una; risposte max 1000).
const MAX_QUESTIONS = 4;
const MAX_QUESTION_CHARS = 200;
const MAX_ANSWER_CHARS = 1000;
const MAX_PANELS = 10;

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
  if (t.pinned !== true) t.pinned = false;
  if (!Array.isArray(t.answers)) t.answers = [];
  t.answers = t.answers
    .filter((a) => a && typeof a === 'object' && typeof a.a === 'string' && a.a.trim())
    .slice(-MAX_QUESTIONS)
    .map((a) => ({
      q: String(a.q || '').trim().slice(0, MAX_QUESTION_CHARS),
      a: a.a.trim().slice(0, MAX_ANSWER_CHARS),
    }));
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

// ---------- OPEN-TICKET style: blacklist, pin, tipo ----------

/** true se l'utente non può aprire ticket in questo server. */
function isBlacklisted(guildId, userId) {
  try {
    const bl = guildData(guildId).config.blacklist;
    return Array.isArray(bl) && bl.includes(String(userId));
  } catch {
    return false;
  }
}

/** Aggiunge/rimuove dalla blacklist. Ritorna true se cambiato. */
function setBlacklisted(guildId, userId, blocked) {
  const data = guildData(guildId);
  if (!Array.isArray(data.config.blacklist)) data.config.blacklist = [];
  const id = String(userId);
  const has = data.config.blacklist.includes(id);
  if (blocked && !has) {
    if (data.config.blacklist.length >= 200) throw new Error('Blacklist piena (max 200).');
    data.config.blacklist.push(id);
    persist(guildId, data);
    return true;
  }
  if (!blocked && has) {
    data.config.blacklist = data.config.blacklist.filter((x) => x !== id);
    persist(guildId, data);
    return true;
  }
  return false;
}

/** Protegge/sprotegge un ticket da autoclose e auto-eliminazione. */
function setPinned(guildId, channelId, pinned) {
  const data = guildData(guildId);
  const t = data.tickets[channelId];
  if (!t) return null;
  t.pinned = pinned === true;
  persist(guildId, data);
  return t;
}

/** Cambia il tipo di un ticket. Lancia su tipo sconosciuto. */
function setTicketType(guildId, channelId, type) {
  const t = assertKnownType(type);
  const data = guildData(guildId);
  const rec = data.tickets[channelId];
  if (!rec) return null;
  rec.type = t;
  persist(guildId, data);
  return rec;
}

/** Trasferisce la proprietà. Ritorna il ticket o null. */
function transferTicket(guildId, channelId, newOwnerId) {
  if (typeof newOwnerId !== 'string' || !newOwnerId) throw new Error('Nuovo proprietario non valido.');
  const data = guildData(guildId);
  const t = data.tickets[channelId];
  if (!t) return null;
  t.ownerId = newOwnerId;
  t.claimedBy = null;
  persist(guildId, data);
  return t;
}

/** Statistiche per staffer: chiusure e rating medio dei ticket chiusi da lui. */
function getStaffStats(guildId, limit = 5) {
  const tickets = openTickets(guildId).filter((t) => t.status === 'closed' && typeof t.closedBy === 'string' && t.closedBy);
  const by = new Map();
  for (const t of tickets) {
    let e = by.get(t.closedBy);
    if (!e) { e = { userId: t.closedBy, closed: 0, ratings: [] }; by.set(t.closedBy, e); }
    e.closed += 1;
    if (t.rating && [1, 2, 3, 4, 5].includes(t.rating.score)) e.ratings.push(t.rating.score);
  }
  return [...by.values()]
    .map((e) => ({
      userId: e.userId,
      closed: e.closed,
      avgRating: e.ratings.length ? Math.round((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length) * 10) / 10 : null,
      ratingsCount: e.ratings.length,
    }))
    .sort((a, b) => b.closed - a.closed)
    .slice(0, Math.max(1, Math.floor(limit) || 5));
}

// ---------- PRO: domande pre-apertura ----------

function assertKnownType(type) {
  const t = String(type || '').toLowerCase().trim();
  if (!TICKET_TYPES[t]) throw new Error(`Tipo sconosciuto (${Object.keys(TICKET_TYPES).join('/')}).`);
  return t;
}

/** Domande per un tipo (max 4). [] se nessuna. */
function getQuestions(guildId, type) {
  try {
    const t = assertKnownType(type);
    const q = guildData(guildId).config.questions?.[t];
    return Array.isArray(q) ? q.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** Imposta le domande (array di stringhe; vuoto = rimuovi). Ritorna la lista. */
function setQuestions(guildId, type, questions) {
  const t = assertKnownType(type);
  const list = (Array.isArray(questions) ? questions : [questions])
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS)
    .map((q) => q.slice(0, MAX_QUESTION_CHARS));
  const data = guildData(guildId);
  if (!data.config.questions || typeof data.config.questions !== 'object') data.config.questions = {};
  if (!list.length) delete data.config.questions[t];
  else data.config.questions[t] = list;
  persist(guildId, data);
  return list;
}

// ---------- PRO: pannelli per sezione ----------

/** Pannelli pubblicati. [] se nessuno. */
function getPanels(guildId) {
  try {
    const p = guildData(guildId).config.panels;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** Registra un pannello pubblicato (upsert per canale). */
function savePanel(guildId, panel) {
  const data = guildData(guildId);
  if (!Array.isArray(data.config.panels)) data.config.panels = [];
  const clean = {
    channelId: String(panel.channelId || ''),
    messageId: String(panel.messageId || ''),
    types: (Array.isArray(panel.types) ? panel.types : []).filter((t) => TICKET_TYPES[t]),
    title: String(panel.title || '').slice(0, 100),
  };
  if (!clean.channelId || !clean.types.length) throw new Error('Pannello non valido.');
  if (clean.types.length > Object.keys(TICKET_TYPES).length) throw new Error('Troppi tipi.');
  data.config.panels = data.config.panels.filter((p) => p.channelId !== clean.channelId);
  if (data.config.panels.length >= MAX_PANELS) throw new Error(`Max ${MAX_PANELS} pannelli per server.`);
  data.config.panels.push(clean);
  persist(guildId, data);
  return clean;
}

/** Dimentica un pannello (il messaggio va eliminato a parte). */
function removePanel(guildId, channelId) {
  const data = guildData(guildId);
  if (!Array.isArray(data.config.panels)) return false;
  const before = data.config.panels.length;
  data.config.panels = data.config.panels.filter((p) => p.channelId !== String(channelId));
  if (data.config.panels.length === before) return false;
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
  MAX_QUESTIONS,
  MAX_QUESTION_CHARS,
  MAX_ANSWER_CHARS,
  MAX_PANELS,
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
  isBlacklisted,
  setBlacklisted,
  setPinned,
  setTicketType,
  transferTicket,
  getStaffStats,
  getQuestions,
  setQuestions,
  getPanels,
  savePanel,
  removePanel,
  touchActivity, // PEAK
};
