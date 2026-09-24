'use strict';
/**
 * src/dashboard/server.js — Dashboard web nello STESSO processo del bot
 * (legge gli stessi JSON DB, nessuna sync).
 *
 * Express è caricato con lazy-require SOLO dentro startDashboard(),
 * così lo smoke test passa anche senza express installato.
 */

const path = require('path');
const fs = require('fs');

// ---- Hardening dashboard (zero dipendenze, require-safe senza express) ----

const CSP_VALUE = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
  "form-action 'self'; img-src 'self' data: https:; font-src 'self' data: https:; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; connect-src 'self'";
// public/index.html + public/login.html usano <style>/<script> inline + Google Fonts,
// public/app.html usa /styles.css + js/*.js (defer) + SVG inline + avatar data:/https::
// public/index.html + public/app.html usano <script> inline / defer + Google Fonts:
// per questo style/script 'unsafe-inline' è necessario (verificato su public/*).
// style-src include fonts.googleapis.com (fogli di stile Google Fonts), font-src https:
// copre i file font su fonts.gstatic.com. SVG inline via DOM (innerHTML statico
// + createElementNS) e addEventListener non richiedono eccezioni: nessun inline
// event handler nel frontend.

function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP_VALUE);
  return next();
}

// Log essenziale: metodo + path (senza query) + status. Niente token/cookie/PII.
function requestLoggerMiddleware(req, res, next) {
  res.on('finish', () => {
    try {
      const raw = typeof req.originalUrl === 'string' ? req.originalUrl
        : (typeof req.url === 'string' ? req.url : '/');
      console.log(`[Dashboard] ${req.method} ${raw.split('?')[0]} -> ${res.statusCode}`);
    } catch { /* mai rompere le risposte per il log */ }
  });
  return next();
}

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_MAX = 120; // max req per IP su /api/*

// Map<ip, { count, resetTime }>; prune pigra ogni 60s, niente timer/dipendenze.
function createApiRateLimiter({ windowMs = RATE_WINDOW_MS, max = RATE_MAX } = {}) {
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
      try {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((e.resetTime - now) / 1000))));
      } catch { /* header best-effort */ }
      return res.status(429).json({ errore: 'Troppe richieste: riprova tra qualche minuto.' });
    }
    return next();
  }
  middleware._hits = hits;
  middleware._prune = prune;
  return middleware;
}

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch {
    return null;
  }
}

function resolveDbBackend() {
  try {
    const store = safeRequire('../database/store');
    if (store && typeof store.backend === 'function') return store.backend();
  } catch { /* fallback sotto */ }
  return 'json';
}

function buildHealthPayload(client) {
  let guilds = 0;
  try {
    const guildsMod = require('./guilds');
    if (guildsMod.isSource(client)) {
      const list = client.listGuilds();
      guilds = Array.isArray(list) ? list.length : 0;
    } else if (client && client.guilds && client.guilds.cache && typeof client.guilds.cache.size === 'number') {
      guilds = client.guilds.cache.size;
    }
  } catch { guilds = 0; }
  let commands = 0;
  try {
    if (client && typeof client.commands?.size === 'number') commands = client.commands.size;
    else if (client && client.commands && client.commands.cache && typeof client.commands.cache.size === 'number') {
      commands = client.commands.cache.size;
    }
  } catch { commands = 0; }
  // mode onesto: embedded = client Discord reale (numeri veri), standalone =
  // processo dashboard separato (guilds dal roster presence, commands non visibili).
  let mode = 'standalone';
  try {
    const guildsMod = require('./guilds');
    mode = guildsMod.isSource(client) ? 'standalone' : 'embedded';
  } catch { /* default standalone */ }
  let features = 0;
  try {
    // Via Commander (orchestratore): la dashboard non tocca mai il registry diretto.
    const commander = require('../modules/commander');
    if (commander && typeof commander.listModules === 'function') features = commander.listModules().length;
  } catch { features = 0; }
  return {
    ok: true,
    mode,
    uptimeSec: Math.floor(process.uptime()),
    guilds,
    commands,
    features,
    backend: resolveDbBackend(),
    db: resolveDbBackend(),
    time: new Date().toISOString(),
  };
}

function startDashboard(client) {
  // client = Client discord.js (stesso processo del bot) OPPURE source guilds
  // (processo dashboard standalone, vedi dashboard/index.js + guilds.js).
  // Lazy: se express manca, lancia qui dentro (il chiamante lo cattura).
  const express = require('express');
  const auth = require('./auth');
  const { createApiRouter } = require('./api');

  const app = express();
  const PORT = Number(process.env.DASHBOARD_PORT) || 3000;

  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(express.json({ limit: '256kb' }));

  // Healthcheck pubblico (Docker HEALTHCHECK): prima di static/auth/rate-limit,
  // così non richiede cookie e non consuma mai il budget /api.
  app.get('/healthz', (req, res) => res.json(buildHealthPayload(client)));

  // Dashboard protetta da login Discord: /app.html richiede sessione valida
  // (redirect a /login per i browser, 401 JSON per le API). Registrata PRIMA
  // dello static, altrimenti il file resterebbe raggiungibile senza login.
  // Landing (/), login.html, CSS e JS restano pubblici: senza sessione le API
  // rispondono comunque 401.
  app.get('/app.html', auth.requireAuthOrRedirect, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
  });

  app.use(express.static(path.join(__dirname, 'public')));

  auth.registerAuthRoutes(app);
  app.use('/api', createApiRateLimiter(), auth.requireAuth, createApiRouter(client));

  // Registro audit: best-effort, mai bloccare l'avvio se il modulo manca.
  try {
    const { mountAudit } = require('./auditRoutes');
    if (typeof mountAudit === 'function') mountAudit(app, client, auth);
  } catch (e) {
    console.error('[Dashboard] auditRoutes non montato:', e && e.message ? e.message : e);
  }

  // Landing: se un altro agente fornisce public/index.html, lo serve lo static;
  // altrimenti fallback inline (mai crashare).
  app.get('/', (req, res) => {
    const indexFile = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    return res.type('html').send(`<!doctype html><html lang="it"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Bot Dashboard</title></head><body style="font-family:sans-serif;max-width:640px;margin:4rem auto;padding:0 1rem">` +
      `<h1>🤖 Bot Dashboard</h1>` +
      `<p>Gestisci il bot dal web: accedi con Discord e configura ogni server.</p>` +
      `<p><a href="/login" style="display:inline-block;background:#5865F2;color:#fff;padding:.7rem 1.4rem;border-radius:8px;text-decoration:none">Accedi con Discord</a></p>` +
      `<p><a href="/api/guilds">Le mie guild (API)</a> · <a href="/logout">Logout</a></p>` +
      `</body></html>`);
  });

  app.use((req, res) => res.status(404).json({ errore: 'Non trovato.' }));

  // Error handler: mai crashare su guild assente o input imprevisti.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500;
    try {
      const raw = err && err.status !== undefined ? Number(err.status) : NaN;
      if (Number.isFinite(raw)) status = Math.floor(raw);
      // body-parser segnala anche via err.type senza status affidabile.
      if (err && err.type === 'entity.parse.failed') status = 400;
      if (err && err.type === 'entity.too.large') status = 413;
      if (status < 400 || status > 599) status = 500;
      const msg = err && err.message ? err.message : String(err);
      console.error(`[Dashboard] error-handler: ${msg} | status=${status}`);
    } catch {
      try { console.error('[Dashboard] error-handler: unknown | status=500'); } catch { /* mai rompere */ }
      status = 500;
    }
    if (res.headersSent) return next(err);
    // body-parser: JSON malformato (400) o body oltre il limite (413) sono errori
    // client, non "interni": messaggio specifico invece del generico 500.
    // Mai riflettere err.message al client (info-leak): solo stringhe fisse.
    if (status === 400) return res.status(400).json({ errore: 'Richiesta non valida: JSON malformato.' });
    if (status === 401) return res.status(401).json({ errore: 'Non autenticato: effettua il login con Discord.' });
    if (status === 403) return res.status(403).json({ errore: 'Accesso negato.' });
    if (status === 404) return res.status(404).json({ errore: 'Non trovato.' });
    if (status === 409) return res.status(409).json({ errore: 'Conflitto: risorsa già esistente.' });
    if (status === 413) return res.status(413).json({ errore: 'Richiesta troppo grande.' });
    if (status === 429) return res.status(429).json({ errore: 'Troppe richieste: riprova tra qualche minuto.' });
    if (status >= 400 && status < 500) return res.status(status).json({ errore: 'Richiesta non valida.' });
    return res.status(status >= 500 && status <= 599 ? status : 500).json({ errore: 'Errore interno, riprova.' });
  });

  const server = app.listen(PORT, () => {
    console.log(`[Dashboard] online su http://localhost:${PORT}`);
  });
  return { app, server };
}

module.exports = {
  startDashboard,
  securityHeadersMiddleware,
  requestLoggerMiddleware,
  createApiRateLimiter,
  buildHealthPayload,
  RATE_WINDOW_MS,
  RATE_MAX,
};
