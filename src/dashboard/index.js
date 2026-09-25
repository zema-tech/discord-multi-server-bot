'use strict';
/**
 * src/dashboard/index.js — Processo dashboard STANDALONE.
 *
 * Avvia SOLO la dashboard web, senza gateway Discord proprio: il roster dei
 * server arriva dal bot via store condiviso (dashboard/presence.js, scritto
 * dal bot su ready/guildCreate/guildDelete), i dettagli live (canali, ruoli,
 * conteggi) via REST con Bot token (dashboard/discordRest.js).
 *
 * Uso: npm run dashboard  (richiede DASHBOARD_PORT; il DB deve essere lo
 * stesso del bot: stessa dir per json, stesso file per sqlite).
 *
 * Questo file NON tocca il codice del bot: vive tutto in src/dashboard/.
 */
require('dotenv').config();

// Render assegna $PORT: vale come DASHBOARD_PORT se questa manca.
if (!process.env.DASHBOARD_PORT && process.env.PORT) {
  process.env.DASHBOARD_PORT = process.env.PORT;
}
const PORT = Number(process.env.DASHBOARD_PORT) || 0;
if (!PORT) {
  console.error('❌ Porta mancante: imposta DASHBOARD_PORT (o $PORT su Render).');
  console.error('   Esempio: DASHBOARD_PORT=3000 npm run dashboard');
  process.exit(1);
}

const problems = [];
if (!process.env.DISCORD_TOKEN) {
  problems.push('DISCORD_TOKEN mancante: serve per leggere canali/ruoli via REST.');
}
if (!process.env.SESSION_SECRET) {
  problems.push('SESSION_SECRET mancante: serve per firmare le sessioni login.');
}
if (!process.env.CLIENT_SECRET) {
  problems.push('CLIENT_SECRET mancante: serve per OAuth2 Discord.');
}
if (!process.env.BASE_URL) {
  problems.push('BASE_URL mancante: es. http://localhost:3000 (redirect OAuth2).');
}
if (problems.length > 0) {
  // Mai uscire: su hosting come Render la porta DEVE restare aperta
  // (port scan timeout). Servi /healthz in degrado e spiega cosa manca.
  for (const p of problems) console.error(`❌ ${p}`);
  console.error('[Dashboard] modalità degradata: solo /healthz, configura le env e riavvia.');
  try {
    const express = require('express');
    const app = express();
    app.disable('x-powered-by');
    app.get('/healthz', (req, res) => res.json({
      ok: false,
      degraded: true,
      mode: 'standalone',
      missing: problems,
      uptimeSec: Math.floor(process.uptime()),
      time: new Date().toISOString(),
    }));
    app.get('/', (req, res) => res.status(503).type('html').send(
      '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Dashboard non configurata</title></head>' +
      '<body style="font-family:sans-serif;max-width:640px;margin:4rem auto;padding:0 1rem">' +
      '<h1>⚠️ Dashboard non configurata</h1><p>Mancano variabili d\u2019ambiente:</p><ul>' +
      problems.map((p) => `<li>${p}</li>`).join('') +
      '</ul><p>Configurale e riavvia il servizio.</p></body></html>'
    ));
    app.listen(PORT, () => console.log(`[Dashboard] degradata in ascolto su :${PORT} (configura le env!)`));
  } catch (e) {
    console.error('[Dashboard] avvio degradata fallito:', e && e.message ? e.message : e);
    process.exit(1);
  }
  return;
}

const { startDashboard } = require('./server');
const { fromRest } = require('./guilds');
const { readPresence } = require('./presence');

const presence = readPresence();
if (!presence || !Array.isArray(presence.guilds) || presence.guilds.length === 0) {
  console.warn('[ATTENZIONE] Nessun roster dal bot (store vuoto): avvia prima il bot, poi riapri la dashboard.');
  if (presence && presence.updatedAt) console.warn(`[ATTENZIONE] Ultimo roster noto: ${presence.updatedAt}.`);
} else {
  console.log(`[Dashboard] roster noto: ${presence.guilds.length} server (aggiornato: ${presence.updatedAt || 'n/d'}).`);
}

process.on('unhandledRejection', (e) => {
  console.error('[Dashboard] UnhandledRejection:', e && e.message ? e.message : e);
});
process.on('uncaughtException', (e) => {
  console.error('[Dashboard] UncaughtException:', e && e.message ? e.message : e);
});

try {
  startDashboard(fromRest());
} catch (e) {
  console.error('[Dashboard] avvio fallito:', e && e.message ? e.message : e);
  process.exit(1);
}
