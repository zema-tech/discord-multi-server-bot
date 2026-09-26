'use strict';
/**
 * apiTokens.js — token API personali per MCP/esterno (stile Claude API keys).
 *
 * Il proprietario di un server crea un token da Discord (/token crea):
 * Claude (o qualunque client MCP) lo usa come Bearer per operare IL BOT
 * solo in quel server. Token salvati solo come sha256 (mai in chiaro),
 * mostrati una volta sola alla creazione. Revoca istantanea.
 */
const crypto = require('crypto');
const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('apiTokens');
const TOKEN_BYTES = 32;
const PREFIX = 'dbt_';

function hash(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function readAll() {
  try {
    const db = load(FILE);
    return db && typeof db === 'object' && !Array.isArray(db) ? db : {};
  } catch {
    return {};
  }
}

function mask(id) {
  return id.length <= 12 ? `${id.slice(0, 4)}…` : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/**
 * Crea un token per (guild, owner). Ritorna { id, token, guildId } —
 * `token` in chiaro SOLO qui (non più recuperabile).
 */
function createToken(guildId, ownerId, label = '') {
  if (!guildId || !ownerId) throw new Error('guildId/ownerId mancanti.');
  const id = `tok_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  const token = `${PREFIX}${crypto.randomBytes(TOKEN_BYTES).toString('hex')}`;
  const db = readAll();
  db[id] = {
    id,
    hash: hash(token),
    guildId: String(guildId),
    ownerId: String(ownerId),
    label: String(label || '').slice(0, 60),
    createdAt: Date.now(),
    lastUsedAt: null,
    uses: 0,
  };
  save(FILE, db);
  return { id, token, guildId: String(guildId) };
}

/** Verifica un Bearer. Ritorna il record (senza hash) o null. Aggiorna uso. */
function verifyToken(token) {
  try {
    const t = String(token || '').trim();
    if (!t.startsWith(PREFIX)) return null;
    const h = hash(t);
    const db = readAll();
    for (const rec of Object.values(db)) {
      if (rec && rec.hash === h) {
        rec.lastUsedAt = Date.now();
        rec.uses = (Number.isFinite(rec.uses) ? rec.uses : 0) + 1;
        try {
          save(FILE, db);
        } catch {}
        const { hash: _h, ...safe } = rec;
        return safe;
      }
    }
  } catch {}
  return null;
}

/** Token di un server (mascherati, per lista). */
function listTokens(guildId) {
  try {
    return Object.values(readAll())
      .filter((r) => r && r.guildId === String(guildId))
      .map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, uses: r.uses || 0, short: mask(r.id) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

/** Revoca. Ritorna true se esisteva (qualsiasi guild: l'id è unguessable). */
function revokeToken(id) {
  try {
    const db = readAll();
    if (db[String(id)] === undefined) return false;
    delete db[String(id)];
    save(FILE, db);
    return true;
  } catch {
    return false;
  }
}

module.exports = { createToken, verifyToken, listTokens, revokeToken, PREFIX };
