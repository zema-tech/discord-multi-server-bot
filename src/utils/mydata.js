/**
 * utils/mydata.js — GDPR stile Lumi: diritto di accesso (export) e di
 * cancellazione (forget) per server. Ambito: SOLO la guild corrente —
 * i dati di altri server vanno chiesti lì (isolamento per design).
 *
 * Forget rimuove: livelli, economy, rep (anche come donatore), warn,
 * fatti del cervello. Anonimizza (serve alla funzione): ticket chiusi
 * (ownerId) e casi moderazione (userId/modId -> 'deleted').
 * I ticket APERTI restano intatti (legittimo interesse: il canale esiste).
 */
const { load, save, dbFile } = require('../database/jsonDb');

const ANON = 'deleted';

function delKey(file, guildId, userId) {
  try {
    const f = dbFile(file);
    const db = load(f);
    if (db && typeof db === 'object' && db[guildId] && typeof db[guildId] === 'object' && db[guildId][userId] !== undefined) {
      delete db[guildId][userId];
      save(f, db);
      return true;
    }
  } catch {}
  return false;
}

/** Snapshot leggibile di tutto ciò che il bot sa di un utente in un server. */
function exportData(guildId, userId) {
  const out = { guildId, userId, exportedAt: new Date().toISOString(), stores: {} };
  try {
    const levels = require('../database/levels');
    out.stores.levels = levels.getLevel(guildId, userId);
  } catch { out.stores.levels = null; }
  try {
    const eco = require('../database/economy');
    const u = eco.getUser(guildId, userId);
    out.stores.economy = { balance: u.balance, bank: u.bank };
  } catch { out.stores.economy = null; }
  try {
    const rep = require('../database/rep');
    out.stores.rep = { count: rep.getRep(guildId, userId).count };
  } catch { out.stores.rep = null; }
  try {
    const warnings = require('../database/warnings');
    out.stores.warnings = warnings.getWarnings(guildId, userId).map((w) => ({ id: w.id, reason: w.reason, at: w.at }));
  } catch { out.stores.warnings = null; }
  try {
    const cases = require('../database/cases');
    out.stores.cases = cases.getUserCases(guildId, userId, 100).map((c) => ({ id: c.id, type: c.type, reason: c.reason, at: c.at }));
  } catch { out.stores.cases = null; }
  try {
    const tickets = require('../database/tickets');
    const { load: l2, dbFile: d2 } = require('../database/jsonDb');
    const db = l2(d2('tickets'));
    const recs = Object.values((db[guildId] && db[guildId].tickets) || {}).filter((t) => t && typeof t === 'object');
    out.stores.tickets = recs
      .filter((t) => t.ownerId === userId)
      .map((t) => ({ number: t.number, type: t.type, status: t.status, createdAt: t.createdAt }));
  } catch { out.stores.tickets = null; }
  try {
    const people = require('../brain/people');
    out.stores.brain = { facts: people.getFacts(guildId, userId) };
  } catch { out.stores.brain = null; }
  return out;
}

/**
 * Cancella/anonimizza. Ritorna { removed: [...nomi store], kept: [...note] }.
 * Mai lancia: ogni store è best-effort.
 */
function forgetData(guildId, userId) {
  const removed = [];
  const kept = [];
  try {
    if (delKey('levels', guildId, userId)) removed.push('livelli');
  } catch {}
  try {
    if (delKey('economy', guildId, userId)) removed.push('economy');
  } catch {}
  try {
    const warnings = require('../database/warnings');
    warnings.clearWarnings(guildId, userId);
    removed.push('warn');
  } catch {}
  try {
    // Rep: record proprio + tracce come donatore nei record altrui.
    delKey('rep', guildId, userId);
    const f = dbFile('rep');
    const db = load(f);
    const g = db && db[guildId];
    if (g && typeof g === 'object') {
      let touched = false;
      for (const rec of Object.values(g)) {
        if (rec && typeof rec === 'object' && rec.lastGiven && typeof rec.lastGiven === 'object' && rec.lastGiven[userId] !== undefined) {
          delete rec.lastGiven[userId];
          touched = true;
        }
      }
      if (touched) save(f, db);
    }
    removed.push('rep');
  } catch {}
  try {
    const people = require('../brain/people');
    if (people.forgetAll(guildId, userId)) removed.push('cervello');
  } catch {}
  try {
    // Ticket chiusi: anonimizza proprietario. Aperti: intoccabili (canale vivo).
    const f = dbFile('tickets');
    const db = load(f);
    const g = db && db[guildId];
    if (g && typeof g.tickets === 'object') {
      let touched = false;
      let openKept = 0;
      for (const t of Object.values(g.tickets)) {
        if (!t || typeof t !== 'object' || t.ownerId !== userId) continue;
        if (t.status === 'closed') {
          t.ownerId = ANON;
          touched = true;
        } else {
          openKept += 1;
        }
      }
      if (touched) save(f, db);
      if (openKept) kept.push(`${openKept} ticket aperti (necessari finché aperti)`);
    }
  } catch {}
  try {
    // Casi moderazione: anonimizza (accountability del server preservata).
    const f = dbFile('cases');
    const db = load(f);
    const g = db && db[guildId];
    if (g && typeof g.items === 'object') {
      let touched = false;
      for (const c of Object.values(g.items)) {
        if (!c || typeof c !== 'object') continue;
        if (c.userId === userId) { c.userId = ANON; touched = true; }
        if (c.modId === userId) { c.modId = ANON; touched = true; }
      }
      if (touched) save(f, db);
      removed.push('casi-moderazione (anonimizzati)');
    }
  } catch {}
  return { removed, kept };
}

module.exports = { exportData, forgetData };
