'use strict';
/**
 * src/dashboard/audit.js — Audit trail delle modifiche dashboard ("grandi bot").
 *
 * Append-only JSON lines su data/dashboard-audit.log. CommonJS, Node 24,
 * zero dipendenze. Mai crashare il chiamante: ogni I/O è in try/catch,
 * la directory viene creata se manca, se il file non è scrivibile
 * logChange ritorna false invece di lanciare.
 *
 * Privacy: MAI l'IP in chiaro nel log — solo ipHash = sha256(ip + data UTC).
 * MAI token/secret nel log — le chiavi che matchano /token|secret|key|password/i
 * vengono skippate, ogni valore è troncato a 200 char.
 *
 *   logChange({ gid, actor, module, keys, ip, ipHash }) -> true|false
 *     - actor: user id Discord se noto, altrimenti 'unknown'.
 *     - keys: oggetto { chiave: valore } delle modifiche (sanitizzato).
 *     - ip: IP in chiaro (viene hashato qui, NON persistito) OPPURE
 *       ipHash già calcolato (es. via hashIp). Se mancano entrambi -> null.
 *   readRecent(gid, n) -> ultime n entry di quella guild (mai lancia, [] se errore)
 *   hashIp(ip, dateStr?) -> sha256 hex di "ip|YYYY-MM-DD" (null se ip assente)
 *
 * Path override per i test: env DASHBOARD_AUDIT_LOG (default data/dashboard-audit.log).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.DASHBOARD_AUDIT_LOG
  || path.join(__dirname, '..', '..', 'data', 'dashboard-audit.log');

const SECRET_KEY_RE = /token|secret|key|password/i;
const MAX_VALUE_LEN = 200;
const MAX_KEYS = 50;
const MAX_STR_FIELD = 128;

function logFile() {
  return process.env.DASHBOARD_AUDIT_LOG
    || path.join(__dirname, '..', '..', 'data', 'dashboard-audit.log');
}

function utcDate(d) {
  try {
    const t = d instanceof Date ? d : new Date();
    return t.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return 'unknown-date';
  }
}

/** sha256 hex di "ip|YYYY-MM-DD" (sale giornaliera: niente tracking cross-giorno). */
function hashIp(ip, dateStr) {
  try {
    if (typeof ip !== 'string' || !ip) return null;
    const day = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : utcDate();
    return crypto.createHash('sha256').update(`${ip}|${day}`, 'utf8').digest('hex');
  } catch {
    return null;
  }
}

function strField(v, fallback) {
  if (typeof v === 'string' && v) return v.slice(0, MAX_STR_FIELD);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).slice(0, MAX_STR_FIELD);
  return fallback;
}

/** Sanitizza { chiave: valore }: skip chiavi secret-like, valori max 200 char. */
function sanitizeKeys(keys) {
  const out = {};
  try {
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
      if (typeof keys === 'string') return { _value: keys.slice(0, MAX_VALUE_LEN) };
      return out;
    }
    let count = 0;
    for (const [k, v] of Object.entries(keys)) {
      if (count >= MAX_KEYS) break;
      if (typeof k !== 'string' || SECRET_KEY_RE.test(k)) continue; // mai token/secret
      let s;
      try {
        s = typeof v === 'string' ? v : JSON.stringify(v);
      } catch {
        s = '[unserializable]';
      }
      if (typeof s !== 'string') s = String(s);
      out[k.slice(0, MAX_STR_FIELD)] = s.slice(0, MAX_VALUE_LEN);
      count += 1;
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * Appende una riga JSON al log. Non lancia mai: true = scritto, false = scartato.
 */
function logChange({ gid, actor, module, keys, ip, ipHash } = {}) {
  try {
    const file = logFile();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    } catch {
      return false; // dir non creabile: scarta senza crashare
    }
    const entry = {
      ts: new Date().toISOString(),
      gid: strField(gid, 'unknown'),
      actor: strField(actor, 'unknown') || 'unknown',
      module: strField(module, 'unknown'),
      keys: sanitizeKeys(keys),
      ipHash: typeof ipHash === 'string' && ipHash
        ? ipHash.slice(0, MAX_STR_FIELD)
        : hashIp(ip),
    };
    try {
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
      return true;
    } catch {
      return false; // file non scrivibile: scarta senza crashare
    }
  } catch {
    return false;
  }
}

/**
 * Ultime n entry del log per una guild (ordine cronologico). Mai lancia.
 */
function readRecent(gid, n) {
  const out = [];
  try {
    const id = String(gid || '');
    if (!id) return out;
    let limit = Math.floor(Number(n));
    if (!Number.isFinite(limit)) limit = 50;
    limit = Math.min(Math.max(1, limit), 200);
    let text;
    try {
      text = fs.readFileSync(logFile(), 'utf8');
    } catch {
      return out; // file mancante/non leggibile: []
    }
    const lines = String(text).split('\n');
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue; // riga corrotta: skip (parse difensivo)
      }
      if (e && typeof e === 'object' && !Array.isArray(e) && String(e.gid) === id) {
        out.push(e);
      }
    }
    out.reverse();
    return out;
  } catch {
    return out;
  }
}

module.exports = { logChange, readRecent, hashIp, LOG_FILE };
