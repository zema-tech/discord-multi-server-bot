'use strict';
/**
 * src/dashboard/auditRoutes.js — Lettura del registro modifiche dashboard.
 *
 * Registra GET /api/guilds/:gid/audit (dietro auth.requireAuth):
 * verifica in modo autonomo che l'utente abbia Manage Server sulla guild
 * (token -> GET /users/@me/guilds via auth.discordApi) e che il bot sia
 * nella guild, poi risponde { entries: [{ ts, actor, module, summary }] }
 * costruite con audit.readRecent().
 *
 * Convenzioni: CommonJS, Node 24. NESSUN require di express (né top-level
 * né in factory: il mount avviene sull'app passata dall'orchestratore, come
 * server.js fa per /healthz). audit è richiesto lazy dentro l'handler così
 * il file resta require-safe. Mai crashare: ogni errore -> JSON generico.
 *
 * Mount (orchestratore, es. server.js):
 *   const { mountAudit } = require('./auditRoutes');
 *   mountAudit(app, client, auth);
 */

const MANAGE_GUILD = 0x20;
const SECRET_KEY_RE = /token|secret|key|password/i;
const SUMMARY_MAX = 120;
const DISCORD_TIMEOUT_MS = 15000;
const DEFAULT_N = 20;
const MAX_N = 100;

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch {
    return null;
  }
}

/** true se l'entry OAuth porta il permesso Manage Server (BigInt-safe). */
function hasManageGuild(entry) {
  try {
    if (!entry || typeof entry !== 'object') return false;
    const p = entry.permissions;
    if (p === undefined || p === null) return false;
    let perms;
    if (typeof p === 'bigint') {
      perms = p;
    } else if (typeof p === 'number') {
      if (!Number.isFinite(p)) return false;
      perms = BigInt(Math.floor(p));
    } else if (typeof p === 'string') {
      const s = p.trim();
      if (!/^\d+$/.test(s)) return false;
      perms = BigInt(s);
    } else {
      return false;
    }
    return (perms & BigInt(MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

/**
 * true se l'errore Discord è rete/lato Discord (timeout dopo race, 429, 5xx,
 * AbortError senza status): il client deve ricevere 503, non 500.
 */
function isDiscordUnavailable(e) {
  if (!e || e.status === undefined || e.status === null) return true;
  if (!Number.isFinite(e.status)) return true;
  return e.status === 429 || e.status >= 500;
}

/** Clona e converte eventuali BigInt in String (JSON.stringify lancia sui BigInt). */
function sanitizeForJson(value, seen) {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  const active = seen || new WeakSet();
  if (active.has(value)) return null;
  active.add(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeForJson(v, active));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    try {
      out[k] = sanitizeForJson(v, active);
    } catch {
      out[k] = null;
    }
  }
  return out;
}

/** Log server-side utile senza mai loggare token/cookie/PII. */
function logDashboardError(route, e) {
  try {
    const msg = e && e.message ? String(e.message).slice(0, 200) : String(e).slice(0, 200);
    const st = e && e.status !== undefined && e.status !== null ? e.status : 'n/a';
    console.error(`[Dashboard] ${route}: ${msg} | status=${st}`);
  } catch {
    try { console.error('[Dashboard] log-failed | status=n/a'); } catch { /* mai rompere */ }
  }
}

/** Race con timeout: se auth.discordApi pende oltre ms, rigetta (-> 503). */
function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('Discord non risponde (timeout), riprova tra poco.');
      reject(e);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function strField(v, fallback) {
  if (typeof v === 'string' && v) return v.slice(0, 64);
  return fallback;
}

/**
 * Riassunto breve dalle chiavi loggate ("k=v, k=v", max 120ch).
 * Difensivo: salta le chiavi secret-like (mai token/secret in risposta)
 * anche se audit.js le ha già filtrate in scrittura.
 */
function buildSummary(keys) {
  try {
    if (typeof keys === 'string') return keys.slice(0, SUMMARY_MAX);
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return '';
    const parts = [];
    for (const [k, v] of Object.entries(keys)) {
      if (typeof k !== 'string' || !k || SECRET_KEY_RE.test(k)) continue;
      let s;
      try {
        s = typeof v === 'string' ? v : JSON.stringify(v);
      } catch {
        s = '[unserializable]';
      }
      if (typeof s !== 'string') s = String(s);
      parts.push(`${k}=${s}`);
      if (parts.join(', ').length >= SUMMARY_MAX) break;
    }
    return parts.join(', ').slice(0, SUMMARY_MAX);
  } catch {
    return '';
  }
}

/** Query ?n=: intero 1..100, default 20. */
function parseLimit(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_N;
  return Math.min(Math.max(1, n), MAX_N);
}

/**
 * Monta GET /api/guilds/:gid/audit su app (dietro auth.requireAuth).
 * Ritorna app per concatenamento.
 */
function mountAudit(app, client, auth) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('mountAudit: app express non valida.');
  }
  const needAuth = auth && typeof auth.requireAuth === 'function'
    ? auth.requireAuth
    : (_req, res) => res.status(401).json({ errore: 'Non autenticato.' });

  app.get('/api/guilds/:gid/audit', needAuth, async (req, res) => {
    try {
      const token = req.discordToken;
      if (!token) return res.status(401).json({ errore: 'Non autenticato.' });
      const gid = req.params && req.params.gid ? String(req.params.gid) : '';
      if (!gid) return res.status(403).json({ errore: 'Guild non valida.' });

      // --- Verifica accesso autonoma: token -> guild OAuth dell'utente ---
      let userGuilds;
      try {
        if (!auth || typeof auth.discordApi !== 'function') {
          throw new Error('auth.discordApi non disponibile.');
        }
        userGuilds = await withTimeout(auth.discordApi(token, '/users/@me/guilds'), DISCORD_TIMEOUT_MS);
      } catch (e) {
        if (e && e.status === 401) {
          return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.', relogin: true });
        }
        if (e && e.status === 403) {
          return res.status(401).json({ errore: 'Scope Discord mancante (guilds): riaccedi effettuando di nuovo il login.', relogin: true });
        }
        if (isDiscordUnavailable(e)) {
          logDashboardError('GET /api/guilds/:gid/audit', e);
          return res.status(503).json({ errore: 'Discord non raggiungibile, riprova tra poco.' });
        }
        throw e;
      }

      const entry = Array.isArray(userGuilds)
        ? userGuilds.find((g) => g && g.id === gid)
        : null;
      if (!entry || !hasManageGuild(entry)) {
        return res.status(403).json({ errore: 'Serve il permesso Gestisci Server su questa guild.' });
      }
      const guild = client && client.guilds && client.guilds.cache
        ? client.guilds.cache.get(gid)
        : null;
      if (!guild) {
        return res.status(403).json({ errore: 'Il bot non è presente in questa guild.' });
      }

      // --- Lettura registro ---
      const n = parseLimit(req.query && req.query.n);
      const audit = safeRequire('./audit');
      if (!audit || typeof audit.readRecent !== 'function') {
        throw new Error('Modulo audit non disponibile.');
      }
      let rows = [];
      try {
        rows = audit.readRecent(gid, n) || [];
      } catch (e) {
        throw e;
      }
      const entries = (Array.isArray(rows) ? rows : []).map((e) => ({
        ts: strField(e && e.ts, ''),
        actor: strField(e && e.actor, 'unknown'),
        module: strField(e && e.module, 'unknown'),
        summary: buildSummary(e && e.keys),
      }));
      return res.json(sanitizeForJson({ entries }));
    } catch (e) {
      logDashboardError('GET /api/guilds/:gid/audit', e);
      return res.status(500).json({ errore: 'Impossibile leggere il registro modifiche.' });
    }
  });

  return app;
}

module.exports = { mountAudit };
