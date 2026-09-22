'use strict';
/**
 * src/dashboard/presence.js — Ponte bot -> dashboard (processi separati).
 *
 * Il bot scrive il roster delle guild (id/nome/icona) nello store condiviso
 * (stesso backend del resto: json o sqlite, vedi database/store.js); il
 * processo dashboard lo legge per sapere dove il bot è presente, senza
 * gateway Discord proprio. Dettagli live (canali/ruoli/con completely:
 * vedi discordRest.js).
 *
 * Mai lanciare: ogni funzione è best-effort e ritorna fallback.
 */

function coll() {
  try {
    const store = require('../database/store');
    return store.collection('dashboard_presence');
  } catch {
    return null;
  }
}

function snapshotGuild(g) {
  try {
    if (!g || !g.id) return null;
    const mc = typeof g.memberCount === 'number' && Number.isFinite(g.memberCount) ? g.memberCount : null;
    return {
      id: String(g.id),
      name: typeof g.name === 'string' ? g.name.slice(0, 100) : String(g.id),
      icon: typeof g.icon === 'string' ? g.icon : (g.icon ? String(g.icon) : null),
      memberCount: mc,
    };
  } catch {
    return null;
  }
}

/** Scatta il roster dal client Discord. Ritorna { guilds, updatedAt }. */
function buildSnapshot(client) {
  const out = { guilds: [], updatedAt: new Date().toISOString() };
  try {
    const cache = client && client.guilds && client.guilds.cache;
    if (!cache) return out;
    const values = typeof cache.values === 'function' ? [...cache.values()] : [];
    for (const g of values) {
      const s = snapshotGuild(g);
      if (s) out.guilds.push(s);
    }
  } catch { /* snapshot parziale: meglio di niente */ }
  return out;
}

/**
 * Scrive il roster (chiamata dal bot: ready + guildCreate/guildDelete).
 * Ritorna true se scritto, false altrimenti (mai lancia).
 */
function writePresence(client) {
  try {
    const c = coll();
    if (!c || typeof c.set !== 'function') return false;
    const snap = buildSnapshot(client);
    c.set('guilds', snap);
    return true;
  } catch {
    return false;
  }
}

/**
 * Legge il roster (processo dashboard). Ritorna { guilds, updatedAt }
 * oppure null se il bot non ha mai scritto (dashboard avviata prima del bot).
 */
function readPresence() {
  try {
    const c = coll();
    if (!c || typeof c.get !== 'function') return null;
    const snap = c.get('guilds', null);
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.guilds)) return null;
    return snap;
  } catch {
    return null;
  }
}

module.exports = { writePresence, readPresence, buildSnapshot };
