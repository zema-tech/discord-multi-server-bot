'use strict';
/**
 * src/agents/approvals.js — Cancello umano (human-in-the-loop).
 *
 * Azioni rischiose (login a servizi, domande al proprietario, azioni
 * distruttive) si fermano qui finché un umano approva o nega — dalla
 * dashboard (control-room) o dai bottoni Discord. Scade in diniego.
 * Stato sullo store condiviso: funziona tra processo bot e dashboard.
 */

function col() {
  return require('../database/store').collection('agents');
}

function now() {
  return new Date().toISOString();
}

function newId() {
  try {
    return `a_${Date.now().toString(36)}${require('crypto').randomBytes(4).toString('hex')}`;
  } catch {
    return `a_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
  }
}

function timeoutMs() {
  const raw = process.env.JARVIS_APPROVAL_TIMEOUT_MS;
  const n = Number.parseInt(String(raw || ''), 10);
  if (Number.isFinite(n) && n >= 10000) return Math.min(n, 15 * 60 * 1000);
  return 120000; // 2 minuti, poi diniego automatico
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Crea una richiesta. Ritorna { id, wait }.
 * `onRequest` (opzionale) viene chiamato subito: il comando Discord lo usa
 * per mostrare i bottoni Approva/Nega mentre wait() resta in attesa.
 */
function request({ sessionId, agentId, kind = 'action', title = '', detail = '' } = {}) {
  const rec = {
    id: newId(),
    sessionId: sessionId || null,
    agentId: agentId || null,
    kind: String(kind),
    title: String(title).slice(0, 200),
    detail: String(detail).slice(0, 1000),
    status: 'pending',
    note: null,
    by: null,
    createdAt: now(),
    resolvedAt: null,
  };
  try {
    col().set(`approval:${rec.id}`, rec);
  } catch {}

  async function wait() {
    const deadline = Date.now() + timeoutMs();
    for (;;) {
      let cur = null;
      try {
        cur = col().get(`approval:${rec.id}`, null);
      } catch {}
      if (cur && cur.status !== 'pending') {
        return { approved: cur.status === 'approved', by: cur.by || null, note: cur.note || null };
      }
      if (Date.now() >= deadline) {
        try {
          const latest = col().get(`approval:${rec.id}`, null);
          if (latest && latest.status === 'pending') {
            latest.status = 'denied';
            latest.by = 'timeout';
            latest.resolvedAt = now();
            col().set(`approval:${rec.id}`, latest);
          }
        } catch {}
        return { approved: false, by: 'timeout', note: null };
      }
      await sleep(750);
    }
  }

  return { id: rec.id, record: rec, wait };
}

/** Risolve una pending (dashboard, bottoni Discord, take-over). */
function resolve(id, approved, by = 'owner', note = null) {
  let cur = null;
  try {
    cur = col().get(`approval:${String(id)}`, null);
  } catch {}
  if (!cur || cur.status !== 'pending') return null;
  cur.status = approved ? 'approved' : 'denied';
  cur.by = String(by || 'owner').slice(0, 100);
  cur.note = note === null || note === undefined ? null : String(note).slice(0, 1000);
  cur.resolvedAt = now();
  try {
    col().set(`approval:${cur.id}`, cur);
  } catch {}
  return cur;
}

function get(id) {
  try {
    return col().get(`approval:${String(id)}`, null);
  } catch {
    return null;
  }
}

/** Pending globali (control-room) + quelle di una sessione. */
function pending(sessionId = null) {
  // Le pending non sono indicizzate: scansione leggera via lista sessioni.
  const out = [];
  try {
    const sessions = require('./sessions').list(30);
    const seen = new Set();
    const check = (aid) => {
      if (seen.has(aid)) return;
      seen.add(aid);
      const a = get(aid);
      if (a && a.status === 'pending' && (!sessionId || a.sessionId === sessionId)) out.push(a);
    };
    for (const s of sessions) {
      const full = require('./sessions').get(s.id);
      if (!full || !Array.isArray(full.steps)) continue;
      for (const st of full.steps) {
        if (st && st.type === 'approval' && st.data && st.data.approvalId) check(st.data.approvalId);
      }
    }
  } catch {}
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

module.exports = { request, resolve, get, pending, timeoutMs };
