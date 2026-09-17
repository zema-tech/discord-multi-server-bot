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
const DISCORD_API = 'https://discord.com/api/v10';
const FETCH_TIMEOUT_MS = 15000; // timeout per le chiamate OAuth verso discord.com

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
  const payload = b64urlEncode(JSON.stringify({ at: accessToken, exp: Date.now() + maxAgeMs }));
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verifica firma + scadenza. Ritorna { at, exp } oppure null. */
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
    if (data.exp <= Date.now()) return null;
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
  app.get('/login', (req, res) => {
    try {
      // Anti-CSRF (login CSRF): state casuale in cookie HttpOnly + verifica al callback.
      const state = crypto.randomBytes(16).toString('hex');
      res.setHeader('Set-Cookie', stateCookieHeader(state));
      return res.redirect(buildAuthUrl(state));
    } catch (e) {
      return res.status(500).json({ errore: `Login non configurato: ${e.message}` });
    }
  });

  app.get('/callback', async (req, res) => {
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

  app.get('/logout', (req, res) => {
    clearSessionCookie(res);
    return res.redirect('/');
  });
}

module.exports = {
  COOKIE_NAME,
  STATE_COOKIE,
  createSession,
  verifySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  buildAuthUrl,
  exchangeCode,
  discordApi,
  registerAuthRoutes,
};
