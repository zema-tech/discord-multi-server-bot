// backup.js — backup notturno dei JSON del database (stile selfImprove per lo scheduler).
//
// Ogni notte alle 03:00 (ore locali server): copia `src/database/*.json`
// (+ il file indicato da DB_SQLITE_PATH se esiste) in `backups/YYYY-MM-DD-HHmm/`,
// elimina le cartelle più vecchie di 7 giorni, logga su console e aggiorna
// il journal in `backups/last.json` { at, files, ok }.
// Mai crashare: ogni errore è catturato e riportato (console + journal con ok:false).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DB_DIR = path.join(ROOT, 'src', 'database');
const BACKUP_ROOT = process.env.BACKUP_DIR || path.join(ROOT, 'backups');
const BACKUP_HOUR = 3; // ore 03:00 locali
const DAY_MS = 24 * 3600 * 1000;
const RETENTION_DAYS = 7;
const DIR_RE = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Nome cartella `YYYY-MM-DD-HHmm` per un timestamp (ora locale server). */
function dirNameFor(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** ms mancanti alle prossime 03:00 locali. Pura e testabile. */
function msUntilNextBackup(now = Date.now()) {
  const d = new Date(now);
  d.setHours(BACKUP_HOUR, 0, 0, 0);
  let ms = d.getTime() - now;
  if (ms <= 0) ms += DAY_MS;
  return ms;
}

function dirTimeMs(name) {
  const m = DIR_RE.exec(name);
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  return Number.isFinite(t) ? t : null;
}

function dirSizeBytes(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirSizeBytes(full);
      else total += fs.statSync(full).size;
    } catch {
      // File sparito nel frattempo: ignora, mai crashare.
    }
  }
  return total;
}

/** Lista le cartelle di backup (più recenti prima). Utile anche a `/export backup-lista`. */
function listBackups(backupRoot = BACKUP_ROOT) {
  let entries = [];
  try {
    entries = fs.readdirSync(backupRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && DIR_RE.test(e.name))
    .map((e) => {
      const full = path.join(backupRoot, e.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {}
      return { name: e.name, dir: full, at: dirTimeMs(e.name) ?? mtime, size: dirSizeBytes(full) };
    })
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** Elimina le cartelle di backup più vecchie di `retentionDays`. Ritorna i nomi eliminati. */
function pruneBackups(backupRoot = BACKUP_ROOT, retentionDays = RETENTION_DAYS, now = Date.now()) {
  const removed = [];
  for (const b of listBackups(backupRoot)) {
    const age = now - (b.at || now);
    if (age > retentionDays * DAY_MS) {
      try {
        fs.rmSync(b.dir, { recursive: true, force: true });
        removed.push(b.name);
      } catch (e) {
        console.error(`[backup] prune ${b.name}:`, e.message);
      }
    }
  }
  if (removed.length) console.log(`[backup] prune: eliminate ${removed.length} cartelle (${removed.join(', ')}).`);
  return removed;
}

function writeJournal(backupRoot, entry) {
  try {
    if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot, { recursive: true });
    fs.writeFileSync(path.join(backupRoot, 'last.json'), JSON.stringify(entry, null, 2));
  } catch (e) {
    console.error('[backup] journal:', e.message);
  }
}

function readJournal(backupRoot = BACKUP_ROOT) {
  try {
    return JSON.parse(fs.readFileSync(path.join(backupRoot, 'last.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Esegue un backup completo. MAI lancia eccezioni: gli errori finiscono
 * nel risultato ({ ok:false, error }) + journal + console.
 *
 * Opzioni (per test): { now, backupRoot, dbDir, sqlitePath, retentionDays }.
 */
function runBackupNow(opts = {}) {
  const now = opts.now ?? Date.now();
  const backupRoot = opts.backupRoot || BACKUP_ROOT;
  const dbDir = opts.dbDir || DB_DIR;
  const sqlitePath = opts.sqlitePath ?? process.env.DB_SQLITE_PATH;
  const retentionDays = opts.retentionDays ?? RETENTION_DAYS;
  const result = { at: now, dir: null, files: [], ok: false, error: null, pruned: [] };

  try {
    const name = dirNameFor(now);
    const dest = path.join(backupRoot, name);
    fs.mkdirSync(dest, { recursive: true });

    let sources = [];
    try {
      sources = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'));
    } catch (e) {
      throw new Error(`cartella database non leggibile: ${e.message}`);
    }

    for (const file of sources) {
      // Mai copiare file temporanei o quarantene da DB corrotto.
      if (file.endsWith('.tmp') || file.includes('.corrupt-')) continue;
      try {
        fs.copyFileSync(path.join(dbDir, file), path.join(dest, file));
        result.files.push(file);
      } catch (e) {
        console.error(`[backup] copia ${file}:`, e.message);
      }
    }

    if (sqlitePath && fs.existsSync(sqlitePath)) {
      try {
        fs.copyFileSync(sqlitePath, path.join(dest, path.basename(sqlitePath)));
        result.files.push(path.basename(sqlitePath));
      } catch (e) {
        console.error('[backup] copia sqlite:', e.message);
      }
    }

    result.dir = dest;
    result.ok = result.files.length > 0;
    if (!result.ok) result.error = 'nessun file copiato (database vuoto o illeggibile?)';

    try {
      result.pruned = pruneBackups(backupRoot, retentionDays, now);
    } catch (e) {
      console.error('[backup] prune:', e.message);
    }

    console.log(`[backup] ${name}: ${result.files.length} file${result.ok ? '' : ' — FALLITO'}.`);
    writeJournal(backupRoot, { at: result.at, dir: result.dir, files: result.files, ok: result.ok });
    return result;
  } catch (e) {
    result.ok = false;
    result.error = e.message;
    console.error('[backup] errore:', e.message);
    try {
      writeJournal(backupRoot, { at: result.at, dir: result.dir, files: result.files, ok: false });
    } catch {}
    return result;
  }
}

let started = false;
/** Avvia il backup notturno ore 03:00 (setTimeout + setInterval 24h, entrambi unref). */
function startBackup() {
  if (started) return { enabled: true };
  started = true;
  const tick = () => {
    try {
      runBackupNow();
    } catch (e) {
      console.error('[backup] errore run:', e.message);
    }
  };
  const first = msUntilNextBackup();
  console.log(`[backup] attivo: primo backup tra ${Math.round(first / 60000)} min (ore 03:00), poi ogni 24h.`);
  setTimeout(() => {
    tick();
    setInterval(tick, DAY_MS).unref?.();
  }, first).unref?.();
  return { enabled: true };
}

module.exports = {
  startBackup,
  runBackupNow,
  listBackups,
  pruneBackups,
  readJournal,
  msUntilNextBackup,
  dirNameFor,
  BACKUP_HOUR,
  RETENTION_DAYS,
};
