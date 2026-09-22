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
    dir = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'registry.js').sort();
  } catch {
    return out;
  }
  for (const f of dir) {
    try {
      delete require.cache[require.resolve(path.join(__dirname, f))];
      const mod = require(path.join(__dirname, f));
      if (!mod || typeof mod.id !== 'string' || !mod.id) continue;
      out.push({
        id: mod.id,
        title: typeof mod.title === 'string' ? mod.title : mod.id,
        icon: typeof mod.icon === 'string' ? mod.icon : 'grid',
        section: typeof mod.section === 'string' ? mod.section : 'Altro',
        description: typeof mod.description === 'string' ? mod.description : '',
        commands: Array.isArray(mod.commands) ? mod.commands.filter((c) => typeof c === 'string') : [],
        db: Array.isArray(mod.db) ? mod.db.filter((d) => typeof d === 'string') : [],
        events: Array.isArray(mod.events) ? mod.events.filter((e) => typeof e === 'string') : [],
        handlers: Array.isArray(mod.handlers) ? mod.handlers.filter((h) => typeof h === 'string') : [],
        locked: mod.locked === true,
        statsExtra: typeof mod.statsExtra === 'function' ? mod.statsExtra : null,
      });
    } catch (e) {
      try { console.error(`[modules] feature non caricata ${f}: ${e.message}`); } catch {}
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
    id: f.id, title: f.title, icon: f.icon, section: f.section,
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
  return ms.setEnabled(guildId, featureId, enabled);
}

// --- Errori per feature (in memoria, per guild): se una parte si rompe,
// resta tracciata qui e visibile in dashboard, senza spegnere il resto. ---
const errors = new Map(); // `${gid}:${fid}` -> { message, at, count }
const ERRORS_MAX = 200;

function recordError(featureId, guildId, err) {
  try {
    if (!featureId) return;
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
  } catch { /* tracking mai bloccante */ }
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
  } catch { /* mai bloccante */ }
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
      title: f.title,
      icon: f.icon,
      section: f.section,
      description: f.description,
      enabled,
      locked: f.locked,
      commands: f.commands.length,
      ok: !err,
      errors: err ? [err] : [],
      stats: cleanStats,
    };
  });
}

module.exports = {
  ids, get, list, isLocked, featureOfCommand,
  isEnabled, setEnabled, recordError, getErrors, clearErrors, health,
};
