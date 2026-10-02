'use strict';
/**
 * src/agents/tools.js — Cassetta attrezzi degli agenti (capability-based).
 *
 * Lo specialista NON ha require/fs/rete liberi: agisce solo tramite questi
 * tool, ognuno loggato nella sessione (goggles) e filtrato dalla sandbox
 * secondo manifest.tools. `useService` passa dal vault + approvazione umana.
 */

const sessions = require('./sessions');
const approvals = require('./approvals');

const FETCH_TIMEOUT_MS = 15000;
const FETCH_MAX_BYTES = 400 * 1024;

function blockedHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|::1|fc00:|fe80:)/.test(h)) return true;
  if (h === 'metadata.google.internal' || h === 'instance-data') return true;
  return false;
}

async function fetchWithLimit(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {}
  }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    const slice = buf.slice(0, FETCH_MAX_BYTES);
    return { status: res.status, ok: res.ok, truncated: buf.length > slice.length, text: slice.toString('utf8') };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} ctx { sessionId, agentId, onApproval({id,record}) }
 */
function buildTools(ctx = {}) {
  const { sessionId, agentId } = ctx;

  function logStep(type, text, data) {
    try {
      if (sessionId) sessions.step(sessionId, type, text, data);
    } catch {}
  }

  async function askApproval({ kind, title, detail }) {
    const { id, wait } = approvals.request({ sessionId, agentId, kind, title, detail });
    logStep('approval', `⏳ In attesa di approvazione: ${title}`, { approvalId: id });
    try {
      if (typeof ctx.onApproval === 'function') await ctx.onApproval({ id, kind, title, detail });
    } catch {}
    const res = await wait();
    logStep('approval', res.approved ? `✅ Approvato (${res.by || 'owner'})` : `⛔ Negato (${res.by || 'timeout'})`, {
      approvalId: id,
    });
    return res;
  }

  return {
    /** Testo che finisce nella risposta finale. */
    async say(text) {
      const clean = String(text || '').slice(0, 2000);
      logStep('action', `💬 say: ${clean.slice(0, 300)}`);
      return clean;
    },

    /** Appunto interno visibile nei goggles (non va nella risposta). */
    async note(text) {
      const clean = String(text || '').slice(0, 1000);
      logStep('thought', `📝 ${clean.slice(0, 300)}`);
      return 'ok';
    },

    /** Lettura URL pubblico (SSRF-guard, timeout, tetto dimensioni). */
    async fetchUrl(url) {
      const u = String(url || '').trim();
      let parsed;
      try {
        parsed = new URL(u);
      } catch {
        throw new Error('URL non valido.');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Solo http/https.');
      if (blockedHost(parsed.hostname)) throw new Error('Host interno/bloccato: per sicurezza niente rete locale.');
      logStep('action', `🌐 fetch: ${parsed.hostname}${parsed.pathname.slice(0, 80)}`);
      const r = await fetchWithLimit(u, { headers: { 'User-Agent': 'zealbot-scout/1.0' } });
      const text = r.text.replace(/\s+/g, ' ').trim().slice(0, 3000);
      logStep('observation', `📥 HTTP ${r.status}${r.truncated ? ' (troncato)' : ''}: ${text.slice(0, 300)}`);
      return `HTTP ${r.status}: ${text}`;
    },

    /**
     * Usa un servizio loggato: approvazione umana + broker Bearer.
     * L'agente non vede mai il segreto: viene aggiunto come
     * `Authorization: Bearer <segreto>` dal broker.
     */
    async useService(service, account, req = {}) {
      const svc = String(service || '').slice(0, 80);
      const acc = String(account || 'default').slice(0, 80);
      const vault = require('./vault');
      if (!vault.isEnabled()) throw new Error('Vault disabilitato: imposta VAULT_KEY nel .env e salva la credenziale.');
      if (!vault.hasSecret(svc, acc)) throw new Error(`Nessuna credenziale per "${svc}" (${acc}): il proprietario deve salvarla prima.`);
      const url = String((req && req.url) || '').trim();
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error('URL servizio non valido.');
      }
      if (parsed.protocol !== 'https:') throw new Error('Servizi esterni solo in https.');
      if (blockedHost(parsed.hostname)) throw new Error('Host servizio non consentito.');
      const ap = await askApproval({
        kind: 'login',
        title: `Usa servizio "${svc}" (${acc})`,
        detail: `${String((req && req.method) || 'GET').toUpperCase()} ${parsed.hostname}${parsed.pathname.slice(0, 100)}`,
      });
      if (!ap.approved) throw new Error('Uso servizio negato dal proprietario.');
      logStep('action', `🔑 broker → ${svc} (${acc})`);
      return vault.withSecret({ agentId, sessionId, service: svc, account: acc }, async (secret) => {
        const method = String((req && req.method) || 'GET').toUpperCase();
        const body = req && req.body !== undefined ? JSON.stringify(req.body).slice(0, 4000) : undefined;
        const r = await fetchWithLimit(url, {
          method,
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'User-Agent': 'zealbot-broker/1.0' },
          body,
        });
        const text = r.text.replace(/\s+/g, ' ').trim().slice(0, 1500);
        // Mai riflettere il segreto: se per sbaglio è nell'output, oscuralo.
        const safe = text.split(secret).join('•••');
        logStep('observation', `📥 ${svc}: HTTP ${r.status}: ${safe.slice(0, 300)}`);
        return `HTTP ${r.status}: ${safe}`;
      });
    },

    /** Domanda al proprietario (approvazione con nota = risposta). */
    async askOwner(question) {
      const ap = await askApproval({ kind: 'question', title: 'Domanda al proprietario', detail: String(question).slice(0, 500) });
      if (!ap.approved) throw new Error('Il proprietario non ha risposto (timeout/diniego).');
      return ap.note || '(approvato senza nota)';
    },
  };
}

/** Nomi tool disponibili (per il prompt ReAct). */
function catalog() {
  return [
    'say(testo) — scrive nella risposta finale',
    'note(testo) — appunto interno (solo goggles)',
    'fetchUrl(url) — legge una pagina pubblica',
    'useService(servizio, account, {url, method, body}) — servizio loggato via vault (richiede approvazione)',
    'askOwner(domanda) — chiede al proprietario (richiede approvazione)',
  ];
}

module.exports = { buildTools, catalog };
