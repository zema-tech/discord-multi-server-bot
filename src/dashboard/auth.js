'use strict';
/**
 * src/dashboard/auth.js — OAuth2 Discord + sessione su cookie firmato.
 *
 * Convenzioni: CommonJS, nessun'altra dipendenza oltre express (che qui NON
 * serve nemmeno: solo `crypto` nativo + `fetch` globale). Niente session lib:
 * il cookie `pb_session` vale `base64url(JSON{at,exp}).base64url(HMAC-SHA256)`.
 *
 * Questo file non carica mai express (né a top-level né altrove): resta
 * require-safe anche senza express installato.
 */

const crypto = require('crypto');

const COOKIE_NAME = 'pb_session';
const STATE_COOKIE = 'pb_oauth_state';
const STATE_MAX_AGE_SEC = 600; // 10 min: basta per completare il login
const SESSION_DAYS = 7;
const SESSION_VERSION = 1; // v nel payload firmato: bump per invalidare sessioni vecchie
const SESSION_SKEW_MS = 5 * 60 * 1000; // 5 min di tolleranza clock-skew su iat/exp
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke';
const FETCH_TIMEOUT_MS = 15000; // timeout per le chiamate OAuth verso discord.com
const REVOKE_TIMEOUT_MS = 10000; // best-effort: la revoca non deve mai rallentare il logout
const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 min
const LOGIN_RATE_MAX = 30; // max hit/IP su /login + /callback per finestra

/** fetch con timeout 15s: abort + errore chiaro in italiano. */
async function fetchConTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('Discord non risponde (timeout 15s), riprova più tardi.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function cfg() {
  return {
    sessionSecret: process.env.SESSION_SECRET || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    baseUrl: (process.env.BASE_URL || '').replace(/\/+$/, ''),
  };
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(String(str), 'base64url');
}

/** Crea il valore del cookie di sessione per un access token Discord. */
function createSession(accessToken, maxAgeMs = SESSION_DAYS * 24 * 3600 * 1000) {
  const { sessionSecret } = cfg();
  if (!sessionSecret) throw new Error('SESSION_SECRET mancante: configura la variabile d\u2019ambiente.');
  const now = Date.now();
  const payload = b64urlEncode(JSON.stringify({ at: accessToken, exp: now + maxAgeMs, iat: now, v: SESSION_VERSION }));
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verifica firma + scadenza. Ritorna { at, exp } oppure null.
 * I cookie nuovi portano iat+v (validati se presenti); i cookie legacy
 * {at,exp} restano accettati senza rompere il login esistente.
 */
function verifySession(value) {
  try {
    const { sessionSecret } = cfg();
    if (!value || !sessionSecret) return null;
    const parts = String(value).split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, sig] = parts;
    const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest();
    const got = b64urlDecode(sig);
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
    const data = JSON.parse(b64urlDecode(payload).toString('utf8'));
    if (!data || typeof data.at !== 'string' || !Number.isFinite(data.exp)) return null;
    const now = Date.now();
    if (data.exp <= now) return null;
    // Sessione hardened: valida v/iat solo se almeno uno è presente
    // (i cookie legacy {at,exp} restano accettati: compatibilità in lettura).
    if (data.v !== undefined || data.iat !== undefined) {
      if (data.v !== SESSION_VERSION) return null;
      if (!Number.isFinite(data.iat)) return null;
      if (data.iat > now + SESSION_SKEW_MS) return null; // iat futuro: possibile forgery
      if (data.iat > data.exp) return null;
      if (data.exp > data.iat + SESSION_DAYS * 24 * 3600 * 1000 + SESSION_SKEW_MS) return null;
    }
    return { at: data.at, exp: data.exp };
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers && req.headers.cookie;
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    // decodeURIComponent lancia su '%' malformati: mai far crashare il middleware.
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function sessionCookieHeader(value, maxAgeSec) {
  const { baseUrl } = cfg();
  const secure = baseUrl.startsWith('https://') ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

function setSessionCookie(res, value) {
  res.setHeader('Set-Cookie', sessionCookieHeader(value, SESSION_DAYS * 24 * 3600));
}

/** Cookie effimero per lo `state` OAuth2 (anti login-CSRF). */
function stateCookieHeader(state) {
  const { baseUrl } = cfg();
  const secure = baseUrl.startsWith('https://') ? '; Secure' : '';
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; Path=/; Max-Age=${STATE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

function clearStateCookieHeader() {
  return `${STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

/** Middleware express: verifica firma+scadenza, mette req.discordToken. */
function requireAuth(req, res, next) {
  const session = verifySession(parseCookies(req)[COOKIE_NAME]);
  if (!session) {
    return res.status(401).json({ errore: 'Non autenticato: effettua il login con Discord.' });
  }
  req.discordToken = session.at;
  return next();
}

/**
 * true se la richiesta si aspetta JSON (fetch/XHR) invece di HTML.
 * Usato per decidere tra 401 JSON e redirect 302 a /login.
 */
function wantsJson(req) {
  const accept = String((req.headers && req.headers.accept) || '').toLowerCase();
  return accept.includes('application/json') && !accept.includes('text/html');
}

/**
 * Middleware express per pagine browser (es. /app.html): se la sessione è
 * valida -> next(); altrimenti redirect 302 a /login per HTML, 401 JSON
 * per richieste API/fetch (Accept: application/json senza text/html).
 */
function requireAuthOrRedirect(req, res, next) {
  const session = verifySession(parseCookies(req)[COOKIE_NAME]);
  if (session) {
    req.discordToken = session.at;
    return next();
  }
  if (wantsJson(req)) {
    return res.status(401).json({ errore: 'Non autenticato: effettua il login con Discord.' });
  }
  return res.redirect(302, '/login');
}

/** true se l'errore indica scope OAuth mancante (es. `guilds` non concesso). */
function isMissingScopeError(e) {
  return !!(e && e.status === 403);
}

/**
 * Rate limiter in-memory per /login e /callback: max 30 hit/IP/10min,
 * prune pigra (niente timer/dipendenze). Superato -> 429 JSON per client
 * API, 429 HTML con messaggio in italiano per i browser.
 */
function loginRateLimiter({ windowMs = LOGIN_RATE_WINDOW_MS, max = LOGIN_RATE_MAX } = {}) {
  const hits = new Map();
  let lastPrune = 0;
  function prune(now) {
    for (const [k, v] of hits) {
      if (v.resetTime <= now) hits.delete(k);
    }
  }
  function middleware(req, res, next) {
    const now = Date.now();
    if (now - lastPrune > 60 * 1000) { prune(now); lastPrune = now; }
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    let e = hits.get(ip);
    if (!e || e.resetTime <= now) { e = { count: 0, resetTime: now + windowMs }; hits.set(ip, e); }
    e.count += 1;
    if (e.count > max) {
      if (wantsJson(req)) {
        return res.status(429).json({ errore: 'Troppi tentativi di login: riprova tra qualche minuto.' });
      }
      return res.status(429).send(
        '<!doctype html><html lang="it"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Troppi tentativi — Multi-Server Bot</title></head>' +
        '<body style="font-family:sans-serif;background:#1e1f22;color:#fff;max-width:560px;margin:4rem auto;padding:0 1rem;text-align:center">' +
        '<h1>Troppi tentativi</h1><p>Hai effettuato troppi tentativi di login: riprova tra qualche minuto.</p>' +
        '<p><a href="/login" style="color:#5865F2">Torna al login</a></p>' +
        '</body></html>'
      );
    }
    return next();
  }
  middleware._hits = hits;
  middleware._prune = prune;
  return middleware;
}

/**
 * Revoca best-effort dell'access token OAuth su Discord (POST urlencoded,
 * timeout 10s). Errori sempre ignorati: mai crashare il logout, mai loggare
 * il token.
 */
async function revokeToken(accessToken) {
  try {
    const { clientId, clientSecret } = cfg();
    if (!accessToken || !clientId || !clientSecret) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS);
    try {
      await fetch(DISCORD_REVOKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'discord-multi-server-bot-dashboard/1.0',
        },
        body: new URLSearchParams({
          token: accessToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best-effort: ignora timeout/rete/Discord non raggiungibile
  }
}

/** URL authorize Discord (scope identify+guilds). `state` anti-CSRF opzionale. */
function buildAuthUrl(state) {
  const { clientId, baseUrl } = cfg();
  if (!clientId) throw new Error('CLIENT_ID mancante: configura la variabile d\u2019ambiente.');
  if (!baseUrl) throw new Error('BASE_URL mancante (es. http://localhost:3000).');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/callback`,
    response_type: 'code',
    scope: 'identify guilds',
  });
  if (state) params.set('state', state);
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Scambia il code OAuth2 con un access token (via fetch nativo). */
async function exchangeCode(code) {
  const { clientId, clientSecret, baseUrl } = cfg();
  if (!clientId || !clientSecret) throw new Error('CLIENT_ID/CLIENT_SECRET mancanti.');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${baseUrl}/callback`,
  });
  const r = await fetchConTimeout('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'discord-multi-server-bot-dashboard/1.0',
    },
    body,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Token exchange fallito (HTTP ${r.status}): ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data.access_token) throw new Error('Token exchange: access_token assente nella risposta.');
  return data;
}

/** GET autenticata alle API Discord. Lancia su HTTP non-ok. */
async function discordApi(token, apiPath) {
  const r = await fetchConTimeout(`${DISCORD_API}${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'discord-multi-server-bot-dashboard/1.0',
    },
  });
  if (!r.ok) {
    const err = new Error(`Discord API ${apiPath}: HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/** Registra /login, /callback, /logout su un'app express (nessun require qui). */
function registerAuthRoutes(app) {
  const authLimiter = loginRateLimiter();
  app.get('/login', authLimiter, (req, res) => {
    try {
      // Anti-CSRF (login CSRF): state casuale in cookie HttpOnly + verifica al callback.
      const state = crypto.randomBytes(16).toString('hex');
      res.setHeader('Set-Cookie', stateCookieHeader(state));
      return res.redirect(buildAuthUrl(state));
    } catch (e) {
      return res.status(500).json({ errore: `Login non configurato: ${e.message}` });
    }
  });

  app.get('/callback', authLimiter, async (req, res) => {
    try {
      const code = req.query && req.query.code;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ errore: 'Callback OAuth2 senza code.' });
      }
      const qState = req.query && req.query.state;
      const cState = parseCookies(req)[STATE_COOKIE];
      if (!qState || typeof qState !== 'string' || !cState || qState !== cState) {
        return res.status(400).json({ errore: 'Callback OAuth2: state non valido (possibile CSRF, riprova il login).' });
      }
      const token = await exchangeCode(code);
      // Setta la sessione e consuma il cookie di state in un colpo solo.
      res.setHeader('Set-Cookie', [
        sessionCookieHeader(createSession(token.access_token), SESSION_DAYS * 24 * 3600),
        clearStateCookieHeader(),
      ]);
      return res.redirect('/');
    } catch (e) {
      console.error('[Dashboard] OAuth callback fallito:', e.message);
      return res.status(500).json({ errore: 'Login Discord fallito, riprova.' });
    }
  });

  app.get('/logout', async (req, res) => {
    // Best-effort: revoca il token OAuth, poi pulisci sempre il cookie.
    // Mai loggare il token, mai far fallire il logout per errori di rete.
    try {
      const session = verifySession(parseCookies(req)[COOKIE_NAME]);
      if (session) await revokeToken(session.at);
    } catch {
      // ignora: il clear del cookie sotto deve avvenire comunque
    }
    clearSessionCookie(res);
    return res.redirect(302, '/login');
  });
}

module.exports = {
  COOKIE_NAME,
  STATE_COOKIE,
  SESSION_VERSION,
  LOGIN_RATE_WINDOW_MS,
  LOGIN_RATE_MAX,
  createSession,
  verifySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAuthOrRedirect,
  wantsJson,
  isMissingScopeError,
  loginRateLimiter,
  revokeToken,
  buildAuthUrl,
  exchangeCode,
  discordApi,
  registerAuthRoutes,
};
