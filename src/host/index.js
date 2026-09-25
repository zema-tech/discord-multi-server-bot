'use strict';
/**
 * src/host/index.js — il bot gira ovunque: rileva l'host e raccomanda i default.
 *
 * Stile opencode (zero-config + override): nessun file di config obbligatorio,
 * ogni default è sovrascrivibile da env. Rilevamento best-effort e puro
 * (testabile senza I/O, a parte il check Docker via /.dockerenv).
 */

const fs = require('fs');

const HOSTS = {
  render: { name: 'Render', persistent: false, needsDisk: true, portEnv: 'PORT' },
  railway: { name: 'Railway', persistent: false, needsDisk: true, portEnv: 'PORT' },
  pterodactyl: { name: 'Pterodactyl', persistent: true, needsDisk: false, portEnv: 'SERVER_PORT' },
  docker: { name: 'Docker', persistent: false, needsDisk: false, portEnv: 'PORT' },
  replit: { name: 'Replit', persistent: true, needsDisk: false, portEnv: 'PORT' },
  termux: { name: 'Termux', persistent: true, needsDisk: false, portEnv: null },
  vps: { name: 'VPS / locale', persistent: true, needsDisk: false, portEnv: null },
};

function inDocker() {
  if (process.env.DOCKER_CONTAINER === '1') return true;
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/**
 * Rileva l'host da env (iniettabile per i test). Ritorna { id, ...profilo }.
 * Mai lanciare: fallback 'vps'.
 */
function detectHost(env = process.env) {
  try {
    const e = env || {};
    if (e.RENDER === 'true' || e.RENDER_SERVICE_NAME) return { id: 'render', ...HOSTS.render };
    if (e.RAILWAY_ENVIRONMENT || e.RAILWAY_SERVICE_NAME) return { id: 'railway', ...HOSTS.railway };
    if (e.PTERODACTYL === '1' || e.P_SERVER_UUID || e.SERVER_MEMORY) return { id: 'pterodactyl', ...HOSTS.pterodactyl };
    if (e.REPL_ID || e.REPLIT_DB_URL || e.REPL_SLUG) return { id: 'replit', ...HOSTS.replit };
    if ((e.PREFIX || '').includes('com.termux')) return { id: 'termux', ...HOSTS.termux };
    if (inDocker()) return { id: 'docker', ...HOSTS.docker };
  } catch {}
  return { id: 'vps', ...HOSTS.vps };
}

/** Node >= 22? (serve per node:sqlite). */
function nodeSupportsSqlite(version = process.version) {
  const m = /^v(\d+)/.exec(String(version || ''));
  return m ? Number(m[1]) >= 22 : false;
}

/**
 * Storage raccomandato per l'host. { backend, path?, warning? }.
 * Regola: disco persistente + Node 22+ -> sqlite; altrimenti json (+ warning
 * se il disco è effimero: i dati si azzerano a ogni deploy).
 */
function recommendStorage(host = detectHost(), opts = {}) {
  const nodeOk = opts.nodeVersion !== undefined ? nodeSupportsSqlite(opts.nodeVersion) : nodeSupportsSqlite();
  if (host.persistent && nodeOk) {
    return { backend: 'sqlite', path: './data/bot.db', warning: null };
  }
  if (!host.persistent && host.needsDisk) {
    return {
      backend: nodeOk ? 'sqlite' : 'json',
      path: nodeOk ? './data/bot.db' : null,
      warning: `Su ${host.name} il filesystem è effimero: monta un disco persistente o i dati si azzerano a ogni deploy.`,
    };
  }
  return { backend: 'json', path: null, warning: null };
}

/** Forma plausibile di un token Discord (3 segmenti). Non verifica in rete. */
function tokenLooksValid(token) {
  const t = String(token || '').trim();
  return /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{15,}$/.test(t);
}

/**
 * Verifica live via Discord API (GET /users/@me). Ritorna { ok, tag?/error? }.
 * Solo per il wizard: mai usata nel boot.
 */
async function checkTokenLive(token, fetchFn = globalThis.fetch) {
  const t = String(token || '').trim();
  if (!tokenLooksValid(t)) return { ok: false, error: 'Formato token non valido.' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 15000);
    try {
      const res = await fetchFn('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${t}` },
        signal: ctrl.signal,
      });
      if (res.status === 401) return { ok: false, error: 'Token rifiutato (401): controllalo nel Developer Portal.' };
      if (!res.ok) return { ok: false, error: `Discord ha risposto ${res.status}.` };
      const me = await res.json().catch(() => ({}));
      return { ok: true, tag: me && me.username ? `${me.username}#${me.discriminator ?? '0'}` : '?' };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, error: `Rete irraggiungibile: ${e.message || e}` };
  }
}

module.exports = { HOSTS, detectHost, nodeSupportsSqlite, recommendStorage, tokenLooksValid, checkTokenLive };
