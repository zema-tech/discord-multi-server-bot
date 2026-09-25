'use strict';
/**
 * src/database/schema.js — versioni e migrazioni dei file JSON (db:migrate minimale).
 *
 * Ogni file versionato ha: CURRENT + passi `migrate(db, from)` additivi e
 * idempotenti. `migrateToCurrent(name, db)` applica i passi mancanti in ordine
 * e timbra `__v`. I file senza voce restano non versionati (ritorno false).
 * Mai lanciare: in errore il db resta com'è (i moduli hanno comunque i
 * backfill difensivi a runtime).
 */

const CURRENT = {
  tickets: 2, // v1: baseline · v2: config additiva (autoCloseDays, panels, questions, tags, blacklist, autoDeleteDays)
  levels: 1, // v1: baseline (sanitize a runtime)
};

function isMetaKey(k) {
  return typeof k === 'string' && k.startsWith('__');
}

function cloneDefault(v) {
  if (Array.isArray(v)) return [...v];
  if (v && typeof v === 'object') return { ...v };
  return v;
}

/** Fonde additivamente i default in ogni db[gid].config. Ritorna true se cambiato. */
function mergeGuildConfig(db, defaults) {
  let changed = false;
  for (const gid of Object.keys(db)) {
    if (isMetaKey(gid)) continue;
    const g = db[gid];
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    if (!g.config || typeof g.config !== 'object' || Array.isArray(g.config)) {
      g.config = {};
      changed = true;
    }
    for (const [k, v] of Object.entries(defaults)) {
      if (g.config[k] === undefined) {
        g.config[k] = cloneDefault(v);
        changed = true;
      }
    }
  }
  return changed;
}

const MIGRATIONS = {
  // tickets v2: i default di DEFAULT_CONFIG diventano la migrazione formale
  // (prima erano backfill sparsi in getConfig). Lazy require: niente cicli.
  tickets: [
    null, // v0->v1: solo timbro
    (db) => {
      let defaults = null;
      try {
        defaults = require('./tickets').DEFAULT_CONFIG;
      } catch {
        return false;
      }
      if (!defaults || typeof defaults !== 'object') return false;
      return mergeGuildConfig(db, defaults);
    },
  ],
  levels: [
    null, // v0->v1: solo timbro (sanitize resta a runtime)
  ],
};

function versionOf(db) {
  const v = db && Number.isFinite(db.__v) ? Math.floor(db.__v) : 0;
  return v < 0 ? 0 : v;
}

/**
 * Applica i passi mancanti e timbra. Ritorna true se il db è cambiato
 * (il chiamante decide se salvare).
 */
function migrateToCurrent(name, db) {
  try {
    if (!db || typeof db !== 'object' || Array.isArray(db)) return false;
    const target = CURRENT[name];
    if (!Number.isFinite(target)) return false;
    const steps = MIGRATIONS[name] || [];
    let from = versionOf(db);
    if (from >= target) return false;
    let changed = false;
    while (from < target) {
      const step = steps[from]; // passo from -> from+1
      if (typeof step === 'function') {
        try {
          if (step(db, from) === true) changed = true;
        } catch {}
      }
      from += 1;
    }
    if (db.__v !== target) {
      db.__v = target;
      changed = true;
    }
    return changed;
  } catch {
    return false;
  }
}

module.exports = { CURRENT, MIGRATIONS, migrateToCurrent, mergeGuildConfig, isMetaKey };
