'use strict';
/**
 * src/agents/sandbox.js — Sandbox per-agente (capability-based, non chroot).
 *
 * Ogni agente gira con:
 *  - solo i tool del suo manifest (niente require/fs/rete liberi),
 *  - una jail directory dedicata (data/sandboxes/<agentId>),
 *  - timeout con AbortSignal (default 120s, env JARVIS_TASK_TIMEOUT_MS),
 *  - audit start/fine/timeout (mai valori sensibili nei log).
 *
 * Onestà tecnica: è isolamento logico a livello applicativo, non una VM:
 * protegge da errori e abusi via tool, non da codice nativo ostile.
 */

const fs = require('fs');
const path = require('path');

const sessions = require('./sessions');
const { buildTools } = require('./tools');

function taskTimeoutMs() {
  const n = Number.parseInt(String(process.env.JARVIS_TASK_TIMEOUT_MS || ''), 10);
  if (Number.isFinite(n) && n >= 10000) return Math.min(n, 10 * 60 * 1000);
  return 120000;
}

function jailDir(agentId) {
  const dir = path.join(process.cwd(), 'data', 'sandboxes', String(agentId || 'jarvis'));
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

function audit(agentId, sessionId, event, extra) {
  try {
    require('../utils/logger').info('Agents', { agent: agentId, session: sessionId, event, ...(extra || {}) });
  } catch {}
}

/**
 * Esegue `taskFn(ctx)` isolato. ctx = { tools, jail, signal, sessionId, agent }.
 * Non lancia mai: ritorna { ok, result?, timedOut?, error? }.
 */
async function runAgent(agent, taskFn, opts = {}) {
  const agentId = agent && agent.id ? agent.id : 'jarvis';
  const sessionId = opts.sessionId || null;
  const timeout = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : taskTimeoutMs();
  const jail = jailDir(agentId);
  const ctrl = new AbortController();

  const allowed = Array.isArray(agent.tools) && agent.tools.length ? agent.tools : ['say', 'note'];
  const all = buildTools({ sessionId, agentId, onApproval: opts.onApproval });
  const tools = {};
  for (const name of allowed) {
    if (typeof all[name] === 'function') tools[name] = all[name];
  }

  audit(agentId, sessionId, 'start');
  const timer = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {}
  }, timeout);
  if (typeof timer.unref === 'function') timer.unref();

  try {
    const result = await taskFn({ tools, jail, signal: ctrl.signal, sessionId, agent });
    clearTimeout(timer);
    if (ctrl.signal.aborted) {
      audit(agentId, sessionId, 'timeout');
      return { ok: false, timedOut: true, error: 'Tempo scaduto.' };
    }
    audit(agentId, sessionId, 'end', { ok: true });
    return { ok: true, result };
  } catch (err) {
    clearTimeout(timer);
    const aborted = ctrl.signal.aborted;
    audit(agentId, sessionId, aborted ? 'timeout' : 'error');
    return { ok: false, timedOut: !!aborted, error: aborted ? 'Tempo scaduto.' : String((err && err.message) || err || 'errore').slice(0, 300) };
  }
}

module.exports = { runAgent, jailDir, taskTimeoutMs };
