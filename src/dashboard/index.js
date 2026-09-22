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

const PORT = Number(process.env.DASHBOARD_PORT) || 0;
if (!PORT) {
  console.error('❌ DASHBOARD_PORT mancante: la dashboard standalone richiede la porta.');
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
  for (const p of problems) console.error(`❌ ${p}`);
  process.exit(1);
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
