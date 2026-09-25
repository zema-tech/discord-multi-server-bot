'use strict';
/**
 * settings.js — override runtime delle variabili (per /config da Discord).
 *
 * Su host senza shell (Termux dal telefono, Pterodactyl, Render) non puoi
 * editare .env: qui imposti le chiavi dalla chat e valgono SUBITO, senza
 * restart (tutti i lettori leggono a ogni chiamata). Precedenza:
 * override > process.env > default del codice. Solo chiavi in WHITELIST.
 */
const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('settings');

const PROVIDERS = ['auto', 'openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'pollinations'];
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function isInt(v, min, max) {
  const n = Number.parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const WHITELIST = {
  AI_PROVIDER: { secret: false, hint: 'auto|openai|anthropic|gemini|groq|openrouter|pollinations', validate: (v) => (PROVIDERS.includes(String(v).trim().toLowerCase()) ? String(v).trim().toLowerCase() : null) },
  AI_MODEL: { secret: false, hint: 'modello custom (vuoto = default provider)', validate: (v) => String(v || '').trim().slice(0, 100) },
  AI_API_URL: { secret: false, hint: 'endpoint OpenAI-compatibile', validate: (v) => String(v || '').trim().slice(0, 300) },
  AI_DAILY_LIMIT: { secret: false, hint: '0-100000 (0 = illimitato)', validate: (v) => { const n = isInt(v, 0, 100000); return n === null ? null : String(n); } },
  LOG_LEVEL: { secret: false, hint: 'debug|info|warn|error', validate: (v) => (LOG_LEVELS.includes(String(v).trim().toLowerCase()) ? String(v).trim().toLowerCase() : null) },
  OPENAI_API_KEY: { secret: true, hint: 'sk-...', validate: (v) => (String(v || '').trim() ? String(v).trim().slice(0, 300) : null) },
  ANTHROPIC_API_KEY: { secret: true, hint: 'sk-ant-...', validate: (v) => (String(v || '').trim() ? String(v).trim().slice(0, 300) : null) },
  GEMINI_API_KEY: { secret: true, hint: '...', validate: (v) => (String(v || '').trim() ? String(v).trim().slice(0, 300) : null) },
  GROQ_API_KEY: { secret: true, hint: 'gsk_...', validate: (v) => (String(v || '').trim() ? String(v).trim().slice(0, 300) : null) },
  OPENROUTER_API_KEY: { secret: true, hint: 'sk-or-...', validate: (v) => (String(v || '').trim() ? String(v).trim().slice(0, 300) : null) },
  AI_API_KEY: { secret: true, hint: 'chiave endpoint custom', validate: (v) => (String(v || '').trim() ? String(v).trim().slice(0, 300) : null) },
};

function readAll() {
  try {
    const db = load(FILE);
    return db && typeof db === 'object' && !Array.isArray(db) ? db : {};
  } catch {
    return {};
  }
}

/** Valore override grezzo (stringa) o undefined. */
function getOverride(key) {
  const all = readAll();
  const v = all[String(key || '').toUpperCase()];
  return typeof v === 'string' ? v : undefined;
}

/** Tutte le chiavi in whitelist con stato. [{key, secret, hint, overridden}] */
function listKeys() {
  const all = readAll();
  return Object.entries(WHITELIST).map(([key, meta]) => ({
    key, secret: meta.secret, hint: meta.hint, overridden: all[key] !== undefined,
  }));
}

/**
 * Imposta un override. Lancia su chiave ignota o valore non valido.
 * Ritorna { key, value } (value sanificato).
 */
function setOverride(key, value) {
  const k = String(key || '').toUpperCase().trim();
  const meta = WHITELIST[k];
  if (!meta) throw new Error(`Chiave non configurabile. Usa /config lista.`);
  const clean = meta.validate(value);
  if (clean === null || clean === undefined || clean === '') {
    throw new Error(`Valore non valido per ${k} (${meta.hint}).`);
  }
  const all = readAll();
  all[k] = clean;
  save(FILE, all);
  return { key: k, value: clean };
}

/** Rimuove un override (torna env/default). Ritorna true se esisteva. */
function deleteOverride(key) {
  const k = String(key || '').toUpperCase().trim();
  if (!WHITELIST[k]) throw new Error(`Chiave non configurabile.`);
  const all = readAll();
  if (all[k] === undefined) return false;
  delete all[k];
  save(FILE, all);
  return true;
}

/** Env effettivo: override sopra process.env. Da usare nei lettori. */
function effectiveEnv(source = process.env) {
  const out = { ...(source || {}) };
  const all = readAll();
  for (const [k, v] of Object.entries(all)) {
    if (WHITELIST[k] && typeof v === 'string') out[k] = v;
  }
  return out;
}

function mask(v) {
  const s = String(v || '');
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

module.exports = { WHITELIST, getOverride, listKeys, setOverride, deleteOverride, effectiveEnv, mask };
