/**
 * invites — storage per l'invite tracker stile PeakBot.
 *
 * Struttura DB (`invites.json`):
 * {
 *   "<guildId>": {
 *     "cache":     { "<code>": { "uses": Number, "inviterId": String|null } },
 *     "stats":     { "<userId>": { "joins": Number, "leaves": Number } },
 *     "invitedBy": { "<userId>": String|null }   // chi ha invitato l'utente (null = sconosciuto)
 *   }
 * }
 *
 * - `cache`: ultimo snapshot noto degli inviti (aggiornato incrementalmente su
 *   InviteCreate/InviteDelete e sincronizzato a ogni GuildMemberAdd).
 * - `stats`: conteggi per invitante. Inviti "validi" = joins - leaves.
 * - `invitedBy`: serve a `/inviti info` ("chi ha invitato X?") e a `recordLeave`
 *   per attribuire l'uscita all'invitante corretto.
 *
 * NOTA: nessun `decUse` — la cache salva gli ultimi `uses` noti, quindi a una
 * delete basta `removeInvite` (nessun decremento da calcolare).
 */
const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('invites');

function blankGuild() {
  return { cache: {}, stats: {}, invitedBy: {} };
}

/** Carica (creando se assente) il blocco della guild; ritorna { db, data }. */
function loadGuild(guildId) {
  const db = load(FILE);
  if (!db[guildId]) {
    db[guildId] = blankGuild();
    save(FILE, db);
  }
  const data = db[guildId];
  // Retro-compatibilità con DB parziali/vecchi.
  if (!data.cache || typeof data.cache !== 'object') data.cache = {};
  if (!data.stats || typeof data.stats !== 'object') data.stats = {};
  if (!data.invitedBy || typeof data.invitedBy !== 'object') data.invitedBy = {};
  return { db, data };
}

function persist(db) {
  save(FILE, db);
}

/** Copia della cache inviti della guild: { code: { uses, inviterId } }. */
function getCache(guildId) {
  const { data } = loadGuild(String(guildId));
  return { ...data.cache };
}

/**
 * Sostituisce l'intera cache (es. priming al primo join o sync da fetch).
 * Accetta Map di discord.js o oggetto semplice; voci malformate ignorate.
 */
function setCache(guildId, cache) {
  const { db, data } = loadGuild(String(guildId));
  const next = {};
  const entries = cache instanceof Map ? cache.entries() : Object.entries(cache || {});
  for (const [code, inv] of entries) {
    if (!code) continue;
    // Supporta sia Invite discord.js ({ uses, inviter }) sia voci già normalizzate.
    const uses = Number(inv && inv.uses !== undefined ? inv.uses : 0) || 0;
    const inviterId =
      inv && typeof inv.inviterId !== 'undefined'
        ? inv.inviterId
        : inv && inv.inviter
          ? inv.inviter.id || null
          : null;
    next[String(code)] = { uses, inviterId: inviterId || null };
  }
  data.cache = next;
  persist(db);
  return { ...next };
}

/** Inserisce/aggiorna un singolo invito (evento InviteCreate). */
function upsertInvite(guildId, code, { uses = 0, inviterId = null } = {}) {
  if (!code) return null;
  const { db, data } = loadGuild(String(guildId));
  const prev = data.cache[String(code)] || {};
  data.cache[String(code)] = {
    uses: Number(uses) || 0,
    // Se il nuovo inviterId è null (es. sync parziale), conserva quello noto.
    inviterId: inviterId || prev.inviterId || null,
  };
  persist(db);
  return { ...data.cache[String(code)] };
}

/** Rimuove un invito dalla cache (evento InviteDelete). Ritorna true se esisteva. */
function removeInvite(guildId, code) {
  if (!code) return false;
  const { db, data } = loadGuild(String(guildId));
  if (!data.cache[String(code)]) return false;
  delete data.cache[String(code)];
  persist(db);
  return true;
}

function blankStats() {
  return { joins: 0, leaves: 0 };
}

function getUserStats(data, userId) {
  const s = data.stats[String(userId)] || blankStats();
  return { joins: Number(s.joins) || 0, leaves: Number(s.leaves) || 0 };
}

/**
 * Registra un join: incrementa `joins` dell'invitante (se noto) e memorizza
 * chi ha invitato il nuovo membro. `inviterId` può essere null (sconosciuto).
 * Ritorna l'inviterId registrato.
 */
function recordJoin(guildId, inviterId, userId) {
  const { db, data } = loadGuild(String(guildId));
  const inv = inviterId ? String(inviterId) : null;
  const uid = String(userId);
  if (inv) {
    const s = getUserStats(data, inv);
    data.stats[inv] = { joins: s.joins + 1, leaves: s.leaves };
  }
  data.invitedBy[uid] = inv;
  persist(db);
  return inv;
}

/**
 * Registra un leave: attribuisce l'uscita all'invitante memorizzato in
 * `invitedBy` (se noto) incrementandone `leaves`.
 * Ritorna l'inviterId a cui è stata attribuita l'uscita (o null).
 */
function recordLeave(guildId, userId) {
  const { db, data } = loadGuild(String(guildId));
  const uid = String(userId);
  const inv = data.invitedBy[uid] || null;
  if (inv) {
    const s = getUserStats(data, inv);
    data.stats[inv] = { joins: s.joins, leaves: s.leaves + 1 };
    persist(db);
  }
  return inv;
}

/** Chi ha invitato l'utente (userId dell'invitante, o null se sconosciuto). */
function getInviter(guildId, userId) {
  const { data } = loadGuild(String(guildId));
  return data.invitedBy[String(userId)] || null;
}

/** Statistiche di un utente: { joins, leaves, valid, invitedBy }. */
function getStats(guildId, userId) {
  const { data } = loadGuild(String(guildId));
  const uid = String(userId);
  const s = getUserStats(data, uid);
  return {
    joins: s.joins,
    leaves: s.leaves,
    valid: s.joins - s.leaves,
    invitedBy: data.invitedBy[uid] || null,
  };
}

/**
 * Classifica invitanti ordinata per inviti validi (joins - leaves), poi joins.
 * Ritorna [{ userId, joins, leaves, valid }], max `limit` voci (clamp 1..25).
 */
function getLeaderboard(guildId, limit = 10) {
  const { data } = loadGuild(String(guildId));
  const n = Math.min(Math.max(Number(limit) || 10, 1), 25);
  return Object.entries(data.stats)
    .map(([userId, s]) => {
      const joins = Number(s.joins) || 0;
      const leaves = Number(s.leaves) || 0;
      return { userId, joins, leaves, valid: joins - leaves };
    })
    .filter((e) => e.joins > 0 || e.leaves > 0)
    .sort((a, b) => b.valid - a.valid || b.joins - a.joins)
    .slice(0, n);
}

module.exports = {
  getCache,
  setCache,
  upsertInvite,
  removeInvite,
  recordJoin,
  recordLeave,
  getInviter,
  getStats,
  getLeaderboard,
};
