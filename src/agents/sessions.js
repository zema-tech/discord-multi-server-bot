'use strict';
/**
 * src/agents/sessions.js — Sessioni agente condivise tra processi.
 *
 * Bot e dashboard sono processi SEPARATI: le sessioni vivono sullo store
 * condiviso (collection `agents`), così la control-room (goggles) vede in
 * diretta ciò che JARVIS e gli specialisti fanno nel processo bot.
 * In più un EventEmitter locale per gli update same-process (live immediata).
 *
 * Step: thought | action | observation | handoff | approval | result | note
 */

const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

function col() {
  return require('../database/store').collection('agents');
}

const MAX_SESSIONS = 30;
const MAX_STEPS = 200;

function now() {
  return new Date().toISOString();
}

function newId(prefix) {
  try {
    const rand = require('crypto').randomBytes(4).toString('hex');
    return `${prefix}_${Date.now().toString(36)}${rand}`;
  } catch {
    return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
  }
}

function read(id) {
  try {
    return col().get(`session:${id}`, null);
  } catch {
    return null;
  }
}

function write(session) {
  try {
    session.updatedAt = now();
    col().set(`session:${session.id}`, session);
  } catch {}
  try {
    bus.emit(`session:${session.id}`, session);
    bus.emit('session', session);
  } catch {}
  return session;
}

/** Crea una sessione e la registra nella lista recenti. */
function start(agentId, task, meta = {}) {
  const session = {
    id: newId('s'),
    agentId: String(agentId || 'jarvis'),
    task: String(task || '').slice(0, 1000),
    guildId: meta.guildId || null,
    userId: meta.userId || null,
    userName: meta.userName || null,
    status: 'running',
    steps: [],
    inbox: [], // istruzioni del proprietario (take-over dalla control-room)
    result: null,
    createdAt: now(),
    updatedAt: now(),
  };
  try {
    col().set(`session:${session.id}`, session);
    const list = col().get('sesslist', []);
    const next = [session.id, ...(Array.isArray(list) ? list : [])].slice(0, MAX_SESSIONS);
    col().set('sesslist', next);
  } catch {}
  try {
    bus.emit('session', session);
  } catch {}
  return session;
}

/** Aggiunge uno step (mai lancia). */
function step(id, type, text, data) {
  const s = read(id);
  if (!s) return null;
  try {
    s.steps.push({ t: now(), type: String(type || 'note'), text: String(text || '').slice(0, 2000) });
    if (s.steps.length > MAX_STEPS) s.steps = s.steps.slice(-MAX_STEPS);
    if (data !== undefined) s.steps[s.steps.length - 1].data = data;
  } catch {
    return s;
  }
  return write(s);
}

/** Il proprietario "entra nello schermo": accoda un'istruzione letta al prossimo giro. */
function inject(id, text) {
  const s = read(id);
  if (!s || s.status !== 'running') return false;
  try {
    s.inbox.push({ t: now(), text: String(text || '').slice(0, 1000) });
  } catch {
    return false;
  }
  write(s);
  return true;
}

/** Preleva e svuota le istruzioni in attesa (chiamato dal loop agente). */
function drainInbox(id) {
  const s = read(id);
  if (!s || !Array.isArray(s.inbox) || s.inbox.length === 0) return [];
  const items = s.inbox.slice();
  try {
    s.inbox = [];
    write(s);
  } catch {}
  return items;
}

/** Chiude la sessione con il risultato finale. */
function end(id, result, status = 'done') {
  const s = read(id);
  if (!s) return null;
  s.status = status;
  if (result !== undefined) {
    try {
      s.result = String(result).slice(0, 4000);
    } catch {
      s.result = '';
    }
  }
  return write(s);
}

function get(id) {
  return read(id);
}

/** Sessioni recenti (senza step, solo anteprima). */
function list(limit = 20) {
  let ids = [];
  try {
    ids = col().get('sesslist', []);
  } catch {
    ids = [];
  }
  const out = [];
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, limit)) {
    const s = read(id);
    if (!s) continue;
    out.push({
      id: s.id,
      agentId: s.agentId,
      task: s.task,
      status: s.status,
      steps: s.steps.length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
  }
  return out;
}

module.exports = { bus, start, step, inject, drainInbox, end, get, list };
