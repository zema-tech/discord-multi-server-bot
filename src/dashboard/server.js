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

function startDashboard(client) {
  // Lazy: se express manca, lancia qui dentro (index.js lo cattura, il bot resta su).
  const express = require('express');
  const auth = require('./auth');
  const { createApiRouter } = require('./api');

  const app = express();
  const PORT = Number(process.env.DASHBOARD_PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  auth.registerAuthRoutes(app);
  app.use('/api', auth.requireAuth, createApiRouter(client));

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

module.exports = { startDashboard };
