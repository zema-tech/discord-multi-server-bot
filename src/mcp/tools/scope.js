'use strict';
/**
 * mcp/tools/scope.js — scope + roster condivisi da tutti i tool MCP.
 *
 * - assertGuild: il token vale SOLO per il suo server (403 logico altrimenti).
 * - rosterEntry: voce del server dal roster presence (`dashboard_presence`,
 *   scritto dal bot su ready/guildCreate/guildDelete). Best-effort: se il
 *   roster manca o il server non c'è, ritorna null e il tool lo segnala nel
 *   payload — MAI un errore (il bot potrebbe essere appena partito).
 * - capLimit: interi con tetto per i top/liste.
 */

const { textResult, toolError, ERR } = require('../protocol');

function assertGuild(tokenRec, guildId) {
  const gid = String(guildId || '');
  if (!gid) throw toolError(ERR.INVALID_PARAMS, 'guildId mancante.');
  if (!tokenRec || gid !== tokenRec.guildId) {
    throw toolError(ERR.FORBIDDEN_GUILD, 'Token non valido per questo server.');
  }
  return gid;
}

/** Roster presence dal DB condiviso. null se non leggibile (mai lancia). */
function readRoster() {
  try {
    const { readPresence } = require('../../dashboard/presence');
    const snap = readPresence();
    if (snap && Array.isArray(snap.guilds)) return snap;
  } catch {}
  return null;
}

/**
 * Voce roster del server + freschezza. { entry, updatedAt, present }.
 * present=false significa "bot non visto in questo server all'ultimo
 * snapshot": il tool lo riporta, ma risponde comunque.
 */
function rosterStatus(guildId) {
  const snap = readRoster();
  if (!snap) return { entry: null, updatedAt: null, present: null };
  const entry = snap.guilds.find((g) => g && String(g.id) === String(guildId)) || null;
  return { entry, updatedAt: snap.updatedAt || null, present: entry !== null };
}

/** Intero con default e tetto (per limit dei top). */
function capLimit(v, def, max) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}

module.exports = { assertGuild, readRoster, rosterStatus, capLimit, textResult, toolError, ERR };
