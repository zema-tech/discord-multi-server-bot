'use strict';

/**
 * store.js — storage sincrono a collection per il bot (CommonJS, zero dipendenze).
 *
 *   const store = require('./store');
 *   const economy = store.collection('economy'); // riusa src/database/economy.json
 *   economy.set('g1:u1', { balance: 100 });
 *   economy.get('g1:u1', {});            // valore o fallback se chiave assente
 *   economy.update('g1:u1', { bank: 50 }); // merge shallow, ritorna l'oggetto unito
 *   economy.delete('g1:u1');             // true se la chiave esisteva
 *   economy.all();                      // { chiave: valore, ... }
 *
 * Backend selezionato da env (letto a ogni operazione, quindi i test possono
 * cambiare env a runtime):
 *   DB_BACKEND=json    (default) file src/database/<name>.json, ESATTAMENTE
 *                       come oggi: stessi path, zero migrazione dati.
 *   DB_BACKEND=sqlite  DatabaseSync di `node:sqlite` (Node 24, niente
 *                       better-sqlite3) su DB_SQLITE_PATH (default
 *                       ./data/bot.db, directory creata se manca), tabella
 *                       kv(collection TEXT, key TEXT, value TEXT,
 *                       PRIMARY KEY(collection, key)), valori JSON.parse /
 *                       JSON.stringify, scritture atomiche, journal_mode=WAL.
 *                       Se `node:sqlite` manca o l'apertura fallisce:
 *                       fallback al backend json + console.warn (MAI crash,
 *                       MAI perdere dati).
 *
 * MAI perdere dati: nel backend json ogni set/update/delete legge prima il
 * file esistente (read-modify-write atomico via tmp+rename); nel backend
 * sqlite la validazione JSON avviene PRIMA di ogni scrittura e i replace
 * multi-riga usano transazioni BEGIN IMMEDIATE/COMMIT con ROLLBACK.
 *
 * Concorrenza: sqlite gira con journal_mode=WAL (lettori non bloccano lo
 * scrittore); il backend json resta single-writer come prima (invariato).
 *
 * FASE 2 — Postgres (futuro, NON attivo qui):
 *   `pg` NON è installato di proposito (zero nuove dipendenze runtime).
 *   Lo schema è già pronto in `src/database/postgres-schema.sql` (tabella kv
 *   + indici, stessa forma collection/key/value con value in JSONB).
 *   Per attivarlo servirà un modulo `storeAsync.js` con la STESSA forma di
 *   collection() ma metodi async (get/set/update/delete/all → Promise),
 *   perché il driver `pg` è solo asincrono e questa API sincrona non può
 *   fare I/O di rete senza bloccare l'event loop. A quel punto:
 *     1. `npm i pg` (+ riga env DATABASE_URL, vedi schema .sql),
 *     2. migrazione una tantum json/sqlite → postgres (script dedicato),
 *     3. riscrittura dei moduli in src/database/*.js sui metodi async.
 *   Nulla di tutto questo è richiesto finché i comandi restano sincroni.
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* Config (da env)                                                    */
/* ------------------------------------------------------------------ */

function configuredBackend() {
  const v = String(process.env.DB_BACKEND || 'json').trim().toLowerCase();
  return v === 'sqlite' ? 'sqlite' : 'json';
}

function sqliteFile() {
  return path.resolve(process.env.DB_SQLITE_PATH || './data/bot.db');
}

/** Path canonico del file json di una collection (identico allo storico). */
function dbFile(name) {
  return path.join(__dirname, `${name}.json`);
}

/* ------------------------------------------------------------------ */
/* JSON low-level — semantica IDENTICA allo storico jsonDb.js          */
/* ------------------------------------------------------------------ */

function ensureFile(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
}

function readJsonFile(file) {
  ensureFile(file);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch {
    // File corrotto: conservalo per il recupero invece di perderlo al prossimo save().
    try {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {}
    return {};
  }
}

function writeJsonFile(file, data) {
  ensureFile(file);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ */
/* SQLite via node:sqlite (lazy + fallback json)                      */
/* ------------------------------------------------------------------ */

let DatabaseSync = null;
let driverProbed = false;
let fallbackWarned = false;

function warnFallback(reason) {
  if (!fallbackWarned) {
    fallbackWarned = true;
    console.warn(`[store] backend sqlite non disponibile (${reason}); fallback a backend json.`);
  }
}

/** Ritorna il costruttore DatabaseSync, o null se non disponibile (con warn). */
function sqliteDriver() {
  if (!driverProbed) {
    driverProbed = true;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (err) {
      DatabaseSync = null;
      warnFallback(err && err.message ? err.message : String(err));
    }
  }
  return DatabaseSync;
}

const sqliteDbs = new Map(); // path assoluto -> DatabaseSync (condiviso per processo)

/** Apre (una volta per path) il db sqlite con WAL + tabella kv, o null in fallback. */
function sqliteDb() {
  const Driver = sqliteDriver();
  if (!Driver) return null;
  const file = sqliteFile();
  const cached = sqliteDbs.get(file);
  if (cached) return cached;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Driver(file);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(
      'CREATE TABLE IF NOT EXISTS kv (' +
        'collection TEXT NOT NULL, ' +
        '"key" TEXT NOT NULL, ' +
        'value TEXT NOT NULL, ' +
        'PRIMARY KEY (collection, "key"))'
    );
    sqliteDbs.set(file, db);
    return db;
  } catch (err) {
    warnFallback(err && err.message ? err.message : String(err));
    return null;
  }
}

/** Ritorna il db sqlite pronto, o null se si deve usare il backend json. */
function useSqliteDb() {
  if (configuredBackend() !== 'sqlite') return null;
  return sqliteDb();
}

/** Backend effettivo dopo il fallback ('json' | 'sqlite'). Non apre file. */
function backend() {
  if (configuredBackend() !== 'sqlite') return 'json';
  return sqliteDriver() ? 'sqlite' : 'json';
}

/** Chiude gli handle sqlite aperti (per test/reopen e shutdown puliti). */
function close() {
  for (const [, db] of sqliteDbs) {
    try {
      db.close();
    } catch {}
  }
  sqliteDbs.clear();
}

/* ------------------------------------------------------------------ */
/* Helpers valori                                                     */
/* ------------------------------------------------------------------ */

function toStoredValue(value) {
  const s = JSON.stringify(value);
  if (s === undefined) throw new TypeError('[store] valore non serializzabile in JSON');
  return s;
}

function fromStoredValue(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[store] riga corrotta ignorata (${what}); chiave saltata.`);
    return undefined;
  }
}

function plainObjectOrEmpty(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/* ------------------------------------------------------------------ */
/* API pubblica: collection(name)                                     */
/* ------------------------------------------------------------------ */

const NAME_RE = /^[A-Za-z0-9_-]+$/;

function collection(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('[store] collection(name): name deve essere una stringa non vuota');
  }
  if (!NAME_RE.test(name)) {
    // Evita path traversal nel backend json (il nome diventa un filename).
    throw new TypeError('[store] collection(name): usa solo [A-Za-z0-9_-]');
  }
  const file = dbFile(name);

  return {
    /** Valore per chiave, o `fallback` (default undefined) se assente/corrotto. */
    get(key, fallback) {
      const k = String(key);
      const db = useSqliteDb();
      if (db) {
        const row = db
          .prepare('SELECT value FROM kv WHERE collection = ? AND "key" = ?')
          .get(name, k);
        if (!row) return fallback;
        const v = fromStoredValue(row.value, `${name}/${k}`);
        return v === undefined ? fallback : v;
      }
      const data = readJsonFile(file);
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : fallback;
    },

    /** Scrive (sovrascrive) un valore; ritorna il valore. Legge prima l'esistente. */
    set(key, value) {
      const k = String(key);
      const stored = toStoredValue(value); // valida PRIMA di toccare il disco
      const db = useSqliteDb();
      if (db) {
        db.prepare('INSERT OR REPLACE INTO kv (collection, "key", value) VALUES (?, ?, ?)').run(
          name,
          k,
          stored
        );
        return value;
      }
      const data = readJsonFile(file); // legge il file esistente: MAI perdere dati
      data[k] = value;
      writeJsonFile(file, data);
      return value;
    },

    /** Merge shallow su oggetto esistente (o {}); ritorna l'oggetto unito. */
    update(key, patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new TypeError('[store] update(key, patch): patch deve essere un oggetto');
      }
      const k = String(key);
      const db = useSqliteDb();
      if (db) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const row = db
            .prepare('SELECT value FROM kv WHERE collection = ? AND "key" = ?')
            .get(name, k);
          const current = row ? fromStoredValue(row.value, `${name}/${k}`) : undefined;
          const merged = { ...plainObjectOrEmpty(current), ...patch };
          db.prepare(
            'INSERT OR REPLACE INTO kv (collection, "key", value) VALUES (?, ?, ?)'
          ).run(name, k, JSON.stringify(merged));
          db.exec('COMMIT');
          return merged;
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {}
          throw err;
        }
      }
      const data = readJsonFile(file);
      const merged = { ...plainObjectOrEmpty(data[k]), ...patch };
      data[k] = merged;
      writeJsonFile(file, data);
      return merged;
    },

    /** Rimuove la chiave; true se esisteva, false altrimenti. */
    delete(key) {
      const k = String(key);
      const db = useSqliteDb();
      if (db) {
        const info = db
          .prepare('DELETE FROM kv WHERE collection = ? AND "key" = ?')
          .run(name, k);
        return !!info && Number(info.changes) > 0;
      }
      const data = readJsonFile(file);
      if (!Object.prototype.hasOwnProperty.call(data, k)) return false;
      delete data[k];
      writeJsonFile(file, data);
      return true;
    },

    /** Tutta la collection come { chiave: valore } (copia fresca ogni volta). */
    all() {
      const db = useSqliteDb();
      if (db) {
        const rows = db
          .prepare('SELECT "key" AS k, value FROM kv WHERE collection = ?')
          .all(name);
        const out = {};
        for (const r of rows) {
          const v = fromStoredValue(r.value, `${name}/${r.k}`);
          if (v !== undefined) out[r.k] = v;
        }
        return out;
      }
      return readJsonFile(file);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Compat file-intero (usato da jsonDb.js: load/save su FILE esistenti) */
/* ------------------------------------------------------------------ */

/** Legge un intero file-db (json) o la collection omonima (sqlite). Ritorna {}. */
function loadFile(file) {
  const db = useSqliteDb();
  if (db) return collection(path.basename(String(file), '.json')).all();
  return readJsonFile(file);
}

/** Scrive un intero file-db in modo atomico (json) o replace transazionale (sqlite). */
function saveFile(file, data) {
  const db = useSqliteDb();
  if (db) {
    const cname = path.basename(String(file), '.json');
    if (!NAME_RE.test(cname)) {
      throw new TypeError(`[store] saveFile: nome collection non valido da "${file}"`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('[store] saveFile: con backend sqlite, data deve essere un oggetto');
    }
    const entries = Object.entries(data);
    const stored = entries.map(([k, v]) => [String(k), toStoredValue(v)]); // valida TUTTO prima
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM kv WHERE collection = ?').run(cname);
      const ins = db.prepare('INSERT INTO kv (collection, "key", value) VALUES (?, ?, ?)');
      for (const [k, s] of stored) ins.run(cname, k, s);
      db.exec('COMMIT');
      return;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }
  writeJsonFile(file, data);
}

module.exports = { collection, loadFile, saveFile, dbFile, backend, close };
