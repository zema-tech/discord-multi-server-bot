'use strict';
/**
 * mcp/auth.js — Bearer personale (vedi /token crea, owner-only).
 * Estrae e verifica: ritorna il record token (senza hash) o null.
 * Il record porta guildId: ogni tool valida la guild contro di esso.
 */
const { verifyToken } = require('../database/apiTokens');

function bearerToken(req) {
  try {
    const h = req.headers.authorization || req.headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function authenticate(req) {
  const t = bearerToken(req);
  if (!t) return null;
  return verifyToken(t);
}

/** Sessioni MCP: id -> { tokenRec, createdAt }. TTL 24h, prune pigra. */
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function pruneSessions(now = Date.now()) {
  try {
    for (const [id, s] of sessions) {
      if (!s || now - (s.createdAt || 0) > SESSION_TTL_MS) sessions.delete(id);
    }
  } catch {}
}

function sessionId(req) {
  try {
    return req.headers['mcp-session-id'] || req.headers['Mcp-Session-Id'] || null;
  } catch {
    return null;
  }
}

module.exports = { bearerToken, authenticate, sessions, pruneSessions, sessionId, SESSION_TTL_MS };
