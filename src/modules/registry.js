'use strict';
/**
 * src/modules/registry.js — Controller centrale delle feature del bot.
 *
 * Ogni feature vive nel suo file (src/modules/<id>.js) con descrittore
 * { id, title, icon, section, description, commands, db, events, handlers,
 *   locked, statsExtra? }. Il registry li carica con isolamento: se un file
 *   è rotto, le altre feature restano registrate (mai crashare per un modulo).
 *
 * Usa: gate comandi/eventi, health dashboard, toggle on/off per guild.
 */

const fs = require('fs');
const path = require('path');

let cache = null;
let cmdMap = null; // commandName -> featureId

function loadAll() {
  if (cache) return cache;
  const out = [];
  let dir = [];
  try {
    dir = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'registry.js' && f !== 'defineModule.js' && f !== 'commander.js').sort();
  } catch {
    return out;
  }
  let validate = null;
  try {
    validate = require('./defineModule').defineModule;
  } catch { validate = null; }
  for (const f of dir) {
    let mod = null;
    try {
      delete require.cache[require.resolve(path.join(__dirname, f))];
      mod = require(path.join(__dirname, f));
    } catch (e) {
      try { console.error(`[modules] feature non caricata ${f}: ${e.message}`); } catch {}
      continue;
    }
    if (!mod || typeof mod.id !== 'string' || !mod.id) continue;
    try {
      // Contratto DefineModule: normalizza e valida (id, comandi, versione).
      const norm = typeof validate === 'function' ? validate(mod, f) : mod;
      out.push({
        id: norm.id,
        version: norm.version || '1.0.0',
        title: typeof norm.title === 'string' ? norm.title : norm.id,
        icon: typeof norm.icon === 'string' ? norm.icon : 'grid',
        section: typeof norm.section === 'string' ? norm.section : 'Altro',
        description: typeof norm.description === 'string' ? norm.description : '',
        commands: Array.isArray(norm.commands) ? norm.commands.filter((c) => typeof c === 'string') : [],
        db: Array.isArray(norm.db) ? norm.db.filter((d) => typeof d === 'string') : [],
        events: Array.isArray(norm.events) ? norm.events.filter((e) => typeof e === 'string') : [],
        handlers: Array.isArray(norm.handlers) ? norm.handlers.filter((h) => typeof h === 'string') : [],
        locked: norm.locked === true,
        statsExtra: typeof norm.statsExtra === 'function' ? norm.statsExtra : null,
      });
    } catch (e) {
      try { console.error(`[modules] contratto violato ${f}: ${e.message}`); } catch {}
    }
  }
  cache = out;
  return out;
}

function buildCmdMap() {
  if (cmdMap) return cmdMap;
  cmdMap = new Map();
  for (const f of loadAll()) {
    for (const c of f.commands) {
      if (!cmdMap.has(c)) cmdMap.set(c, f.id);
    }
  }
  return cmdMap;
}

/** Tutti gli id feature noti (per validazione toggle). */
function ids() {
  return loadAll().map((f) => f.id);
}

function get(id) {
  return loadAll().find((f) => f.id === id) || null;
}

function list() {
  return loadAll().map((f) => ({
    id: f.id, version: f.version || '1.0.0', title: f.title, icon: f.icon, section: f.section,
    description: f.description, commands: f.commands.slice(), locked: f.locked,
  }));
}

function isLocked(id) {
  const f = get(id);
  return Boolean(f && f.locked);
}

/** Feature di un comando (per nome slash). null = non mappato (sempre consentito). */
function featureOfCommand(name) {
  if (!name || typeof name !== 'string') return null;
  try {
    return buildCmdMap().get(name) || null;
  } catch {
    return null;
  }
}

/** Feature di un evento Discord (primo descrittore che lo dichiara). null = nessuno. */
function featureOfEvent(eventName) {
  if (!eventName || typeof eventName !== 'string') return null;
  try {
    for (const f of loadAll()) {
      if (Array.isArray(f.events) && f.events.includes(eventName)) return f.id;
    }
  } catch { /* best-effort */ }
  return null;
}

/** Feature di un componente (bottone/select/modal) dal customId. null = fail-open. */
function featureOfComponent(customId) {
  try {
    const { resolveComponentFeature } = require('../../packages/commander/dist/index.js');
    return resolveComponentFeature(customId, (name) => featureOfCommand(name));
  } catch { return null; }
}

function moduleState() {
  try {
    return require('../database/moduleState');
  } catch {
    return null;
  }
}

function isEnabled(guildId, featureId) {
  if (!featureId) return true;
  if (featureId === 'system' || isLocked(featureId)) return true;
  try {
    const ms = moduleState();
    if (ms && typeof ms.isEnabled === 'function') return ms.isEnabled(guildId, featureId) !== false;
  } catch { /* default on */ }
  return true;
}

function setEnabled(guildId, featureId, enabled) {
  const ms = moduleState();
  if (!ms || typeof ms.setEnabled !== 'function') throw new Error('Modulo toggle non disponibile.');
  const res = ms.setEnabled(guildId, featureId, enabled);
  // Riattivare un modulo azzera anche il breaker e gli errori: riparte pulito.
  if (enabled) {
    try { resetBreaker(guildId, featureId); } catch {}
    try { errors.delete(`${guildId || 'dm'}:${featureId}`); } catch {}
  }
  return res;
}

// --- Errori per feature (in memoria, per guild): se una parte si rompe,
// resta tracciata qui e visibile in dashboard, senza spegnere il resto. ---
const errors = new Map(); // `${gid}:${fid}` -> { message, at, count }
const ERRORS_MAX = 200;

// --- Circuit-breaker (Commander TS): la logica vive in @repo/commander,
// qui solo un'istanza condivisa. Se un modulo fallisce troppe volte in poco
// tempo, viene "isolato" per questa guild: i suoi comandi rispondono con un
// messaggio di protezione invece di eseguire codice rotto.
// Non tocca il toggle persistente (moduleState): è solo memoria + salute.
// Soglia: 5 errori in 10 minuti -> isolato. Reset: on/off, reload, clearErrors.
const {
  Breaker,
  BREAKER_THRESHOLD,
  BREAKER_WINDOW_MS,
} = require('../../packages/commander/dist/index.js');
const breaker = new Breaker(BREAKER_THRESHOLD, BREAKER_WINDOW_MS);

function isIsolated(guildId, featureId) {
  try {
    if (!featureId || featureId === 'system') return false;
    return breaker.isIsolated(guildId, featureId);
  } catch { return false; }
}

function resetBreaker(guildId, featureId) {
  try {
    breaker.reset(guildId, featureId);
  } catch { /* mai bloccante */ }
}

function noteBreaker(guildId, featureId) {
  try {
    if (!featureId || featureId === 'system') return false;
    return breaker.note(guildId, featureId);
  } catch { return false; }
}

function recordError(featureId, guildId, err) {
  try {
    if (!featureId) return { tripped: false };
    const key = `${guildId || 'dm'}:${featureId}`;
    const prev = errors.get(key);
    const message = String((err && err.message) || err || 'errore').slice(0, 300);
    errors.set(key, {
      message,
      at: new Date().toISOString(),
      count: (prev && Number.isFinite(prev.count) ? prev.count : 0) + 1,
    });
    if (errors.size > ERRORS_MAX) {
      const first = errors.keys().next();
      if (!first.done) errors.delete(first.value);
    }
    const tripped = noteBreaker(guildId, featureId);
    return { tripped };
  } catch { return { tripped: false }; }
}

function getErrors(guildId) {
  const out = [];
  try {
    const prefix = `${guildId || 'dm'}:`;
    for (const [key, v] of errors) {
      if (key.startsWith(prefix)) {
        out.push({ feature: key.slice(prefix.length), message: v.message, at: v.at, count: v.count });
      }
    }
  } catch { /* lista vuota */ }
  out.sort((a, b) => (b.count - a.count) || String(b.at).localeCompare(String(a.at)));
  return out.slice(0, 20);
}

function clearErrors(guildId, featureId) {
  try {
    if (featureId) errors.delete(`${guildId || 'dm'}:${featureId}`);
    else {
      const prefix = `${guildId || 'dm'}:`;
      for (const key of [...errors.keys()]) {
        if (key.startsWith(prefix)) errors.delete(key);
      }
    }
    resetBreaker(guildId, featureId);
  } catch { /* mai bloccante */ }
}

/**
 * Commander gate unificato: toggle persistente + circuit-breaker.
 * Ritorna { ok:true } oppure { ok:false, reason:'disabled'|'isolated' }.
 * DM: sempre consentito (nessun toggle, nessun breaker).
 */
function canRun(guildId, featureId) {
  if (!featureId) return { ok: true };
  if (!guildId) return { ok: true };
  if (featureId === 'system' || isLocked(featureId)) return { ok: true };
  try {
    if (!isEnabled(guildId, featureId)) return { ok: false, reason: 'disabled' };
  } catch { /* default on */ }
  try {
    if (isIsolated(guildId, featureId)) return { ok: false, reason: 'isolated' };
  } catch { /* default on */ }
  return { ok: true };
}

/** Svuota la cache: usato da /modulo reload e dai test. */
function reload() {
  cache = null;
  cmdMap = null;
  return loadAll();
}

/**
 * Stato salute per dashboard: [{ id, title, icon, section, description,
 * enabled, locked, commands, ok, errors[], stats }]. Mai lanciare.
 */
function health(guildId) {
  const errs = {};
  try {
    for (const e of getErrors(guildId)) errs[e.feature] = e;
  } catch { /* nessun errore noto */ }
  return loadAll().map((f) => {
    let enabled = true;
    try { enabled = isEnabled(guildId, f.id); } catch { enabled = true; }
    let stats = { commands: f.commands.length };
    try {
      if (typeof f.statsExtra === 'function') {
        const extra = f.statsExtra(guildId);
        if (extra && typeof extra === 'object') stats = { ...stats, ...extra };
      }
    } catch { /* stats parziali */ }
    const err = errs[f.id] || null;
    let isolated = false;
    try { isolated = isIsolated(guildId, f.id); } catch { isolated = false; }
    // Sanitizza: solo tipi JSON.
    const cleanStats = {};
    try {
      for (const [k, v] of Object.entries(stats)) {
        if (typeof v === 'number' && Number.isFinite(v)) cleanStats[k] = v;
        else if (typeof v === 'string') cleanStats[k] = v.slice(0, 120);
        else if (typeof v === 'boolean') cleanStats[k] = v;
      }
    } catch { /* stats vuote */ }
    return {
      id: f.id,
      version: f.version || '1.0.0',
      title: f.title,
      icon: f.icon,
      section: f.section,
      description: f.description,
      enabled,
      locked: f.locked,
      commands: f.commands.length,
      ok: !err && !isolated,
      isolated,
      errors: err ? [err] : [],
      stats: cleanStats,
    };
  });
}

module.exports = {
  ids, get, list, isLocked, featureOfCommand, featureOfEvent, featureOfComponent,
  isEnabled, setEnabled, recordError, getErrors, clearErrors, health,
  canRun, isIsolated, resetBreaker, reload,
  BREAKER_THRESHOLD, BREAKER_WINDOW_MS,
};
