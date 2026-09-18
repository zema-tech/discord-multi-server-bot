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

const CSP_VALUE = "default-src 'self'; img-src 'self' data: https:; " +
  "font-src https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";
// public/index.html usa <script> inline + server.js fallback usa style="" inline:
// per questo style/script 'unsafe-inline' è necessario (verificato su public/*).

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
    guilds = (client && client.guilds && client.guilds.cache && typeof client.guilds.cache.size === 'number')
      ? client.guilds.cache.size : 0;
  } catch { guilds = 0; }
  let commands = 0;
  try {
    if (client && typeof client.commands?.size === 'number') commands = client.commands.size;
    else if (client && client.commands && client.commands.cache && typeof client.commands.cache.size === 'number') {
      commands = client.commands.cache.size;
    }
  } catch { commands = 0; }
  return {
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    guilds,
    commands,
    backend: resolveDbBackend(),
    db: resolveDbBackend(),
    time: new Date().toISOString(),
  };
}

function startDashboard(client) {
  // Lazy: se express manca, lancia qui dentro (index.js lo cattura, il bot resta su).
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

  app.use(express.static(path.join(__dirname, 'public')));

  auth.registerAuthRoutes(app);
  app.use('/api', createApiRateLimiter(), auth.requireAuth, createApiRouter(client));

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
    console.error('[Dashboard] errore:', err && err.message ? err.message : err);
    if (res.headersSent) return next(err);
    const status = err && Number.isFinite(err.status) ? err.status : 500;
    return res.status(status).json({ errore: 'Errore interno, riprova.' });
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
