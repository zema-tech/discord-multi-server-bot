'use strict';

/**
 * env.js — configurazione centralizzata da variabili d'ambiente (CommonJS, zero dipendenze).
 *
 *   const { getEnv, validateEnv } = require('./env');
 *   const env = getEnv();                 // oggetto con default documentati
 *   const check = validateEnv();          // { ok, errors[], warnings[] }
 *
 * NOTE:
 * - Questo modulo NON carica `.env` da solo: `require('dotenv').config()`
 *   resta in `src/index.js` (boot) e deve avvenire PRIMA di chiamare getEnv().
 * - `getEnv(overrides)` / `validateEnv(overrides)`: `overrides` è un oggetto
 *   opzionale i cui valori hanno precedenza su `process.env` (utile nei test).
 *
 * Default documentati (vedi anche `.env.example`):
 *   DISCORD_TOKEN         '' (REQUIRED — unico errore bloccante se mancante)
 *   CLIENT_ID             '' (serve al deploy comandi; warning se manca)
 *   GUILD_ID              '' (opzionale: deploy comandi su un solo server)
 *   AI_PROVIDER           'auto'
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY,
 *   GROQ_API_KEY, OPENROUTER_API_KEY, AI_API_KEY   '' (basta UNA chiave)
 *   AI_MODEL              '' (modello custom; default sensato per provider)
 *   AI_API_URL            'https://text.pollinations.ai' (gratis, senza chiave)
 *   DB_BACKEND            'json' ('json' | 'sqlite'; valori ignoti → 'json')
 *   DB_SQLITE_PATH        './data/bot.db'
 *   BACKUP_DIR            '' (= <root repo>/backups, risolto dal consumer jobs/backup.js)
 *   LOG_LEVEL             'info' (debug | info | warn | error)
 *   LOG_DIR               'logs'
 *   SELF_IMPROVE          false (true solo se '1'; OFF di default)
 *   SELF_IMPROVE_TIME     '22:00' (formato HH:MM)
 *   SELF_IMPROVE_DRY_RUN  false (true solo se '1')
 *   SELF_IMPROVE_GUILD_ID '' (server dove inviare il report)
 *   DASHBOARD_PORT        null (= dashboard disattiva; se impostata, parte)
 *   SESSION_SECRET        '' (richiesta se dashboard attiva)
 *   CLIENT_SECRET         '' (richiesto se dashboard attiva: OAuth2 Discord)
 *   BASE_URL              '' (richiesto se dashboard attiva: es. http://localhost:3000)
 */

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const DEFAULT_AI_API_URL = 'https://text.pollinations.ai';
const DEFAULT_DB_BACKEND = 'json';
const DEFAULT_DB_SQLITE_PATH = './data/bot.db';
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_LOG_DIR = 'logs';
const DEFAULT_SELF_IMPROVE_TIME = '22:00';

/** Stringa non vuota da source, altrimenti default. */
function str(source, name, def) {
  const v = source[name];
  if (v === undefined || v === null) return def;
  const s = String(v);
  return s === '' ? def : s;
}

/** true solo se la variabile vale esattamente '1'. */
function flag(source, name) {
  return String(source[name] || '').trim() === '1';
}

/**
 * Ritorna la configurazione normalizzata da env.
 * @param {object} [overrides={}] valori con precedenza su process.env (per test).
 */
function getEnv(overrides) {
  const source = { ...process.env, ...(overrides || {}) };

  const rawBackend = String(source.DB_BACKEND || '').trim().toLowerCase();
  const dashboardPort = Number.parseInt(String(source.DASHBOARD_PORT || '').trim(), 10);

  return {
    // Discord (base)
    DISCORD_TOKEN: str(source, 'DISCORD_TOKEN', ''),
    CLIENT_ID: str(source, 'CLIENT_ID', '').trim(),
    GUILD_ID: str(source, 'GUILD_ID', '').trim(),

    // AI (basta una chiave; provider scelto in automatico se 'auto')
    AI_PROVIDER: str(source, 'AI_PROVIDER', 'auto').trim() || 'auto',
    OPENAI_API_KEY: str(source, 'OPENAI_API_KEY', ''),
    ANTHROPIC_API_KEY: str(source, 'ANTHROPIC_API_KEY', ''),
    GEMINI_API_KEY: str(source, 'GEMINI_API_KEY', ''),
    GROQ_API_KEY: str(source, 'GROQ_API_KEY', ''),
    OPENROUTER_API_KEY: str(source, 'OPENROUTER_API_KEY', ''),
    AI_MODEL: str(source, 'AI_MODEL', '').trim(),
    AI_API_URL: str(source, 'AI_API_URL', DEFAULT_AI_API_URL).trim() || DEFAULT_AI_API_URL,
    AI_API_KEY: str(source, 'AI_API_KEY', ''),

    // Storage
    DB_BACKEND: rawBackend === 'sqlite' ? 'sqlite' : DEFAULT_DB_BACKEND,
    DB_SQLITE_PATH: str(source, 'DB_SQLITE_PATH', DEFAULT_DB_SQLITE_PATH),
    BACKUP_DIR: str(source, 'BACKUP_DIR', ''), // '' = default consumer (<root>/backups)

    // Logging
    LOG_LEVEL: str(source, 'LOG_LEVEL', DEFAULT_LOG_LEVEL).toLowerCase().trim() || DEFAULT_LOG_LEVEL,
    LOG_DIR: str(source, 'LOG_DIR', DEFAULT_LOG_DIR),

    // Self-improvement notturno (OFF di default)
    SELF_IMPROVE: flag(source, 'SELF_IMPROVE'),
    SELF_IMPROVE_TIME: str(source, 'SELF_IMPROVE_TIME', DEFAULT_SELF_IMPROVE_TIME).trim() || DEFAULT_SELF_IMPROVE_TIME,
    SELF_IMPROVE_DRY_RUN: flag(source, 'SELF_IMPROVE_DRY_RUN'),
    SELF_IMPROVE_GUILD_ID: str(source, 'SELF_IMPROVE_GUILD_ID', '').trim(),

    // Dashboard web (stesso processo del bot; attiva solo se DASHBOARD_PORT è impostata)
    DASHBOARD_PORT: Number.isFinite(dashboardPort) && dashboardPort > 0 ? dashboardPort : null,
    SESSION_SECRET: str(source, 'SESSION_SECRET', ''),
    CLIENT_SECRET: str(source, 'CLIENT_SECRET', ''),
    BASE_URL: str(source, 'BASE_URL', '').trim().replace(/\/+$/, ''),
  };
}

/**
 * Valida la configurazione env.
 * - errors: SOLO problemi bloccanti (DISCORD_TOKEN mancante).
 * - warnings: combo incoerenti o config degradata (il bot parte comunque).
 * @param {object} [overrides={}] valori con precedenza su process.env (per test).
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateEnv(overrides) {
  const raw = { ...process.env, ...(overrides || {}) };
  const env = getEnv(overrides);
  const errors = [];
  const warnings = [];

  // --- Errori bloccanti ---
  if (!env.DISCORD_TOKEN) {
    errors.push('DISCORD_TOKEN mancante: il bot non può connettersi a Discord.');
  }

  // --- Warning: deploy comandi ---
  if (!env.CLIENT_ID) {
    warnings.push('CLIENT_ID mancante: il deploy dei comandi (npm run deploy) non funzionerà.');
  }

  // --- Warning: dashboard ---
  if (env.DASHBOARD_PORT !== null) {
    if (!env.CLIENT_SECRET) {
      warnings.push('DASHBOARD_PORT impostata ma CLIENT_SECRET manca: il login OAuth2 della dashboard non funzionerà.');
    }
    if (!env.SESSION_SECRET) {
      warnings.push('DASHBOARD_PORT impostata ma SESSION_SECRET manca: le sessioni web non saranno sicure.');
    }
    if (!env.BASE_URL) {
      warnings.push('DASHBOARD_PORT impostata ma BASE_URL manca: il callback OAuth2 Discord potrebbe fallire.');
    }
  }

  // --- Warning: storage ---
  const rawBackend = String(raw.DB_BACKEND || '').trim();
  if (rawBackend !== '' && env.DB_BACKEND === 'json' && rawBackend.toLowerCase() !== 'json') {
    warnings.push(`DB_BACKEND non riconosciuto ("${rawBackend}"): uso "${DEFAULT_DB_BACKEND}".`);
  }
  if (env.DB_BACKEND === 'sqlite') {
    const major = Number.parseInt(process.versions.node.split('.')[0], 10);
    if (Number.isFinite(major) && major < 22) {
      warnings.push(`DB_BACKEND=sqlite richiede Node >= 22 per node:sqlite (in uso: ${process.version}): fallback a json.`);
    }
  }

  // --- Warning: logging ---
  if (!LOG_LEVELS.includes(env.LOG_LEVEL)) {
    warnings.push(`LOG_LEVEL non valido ("${env.LOG_LEVEL}"): uso "${DEFAULT_LOG_LEVEL}".`);
  }

  // --- Warning: self-improvement ---
  if (env.SELF_IMPROVE) {
    if (!env.SELF_IMPROVE_GUILD_ID) {
      warnings.push('SELF_IMPROVE attivo ma SELF_IMPROVE_GUILD_ID manca: il report andrà solo nei log.');
    }
    if (!/^\d{2}:\d{2}$/.test(env.SELF_IMPROVE_TIME)) {
      warnings.push(`SELF_IMPROVE_TIME non valido ("${env.SELF_IMPROVE_TIME}"): usare il formato HH:MM (es. 22:00).`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { getEnv, validateEnv };
