'use strict';
/**
 * src/utils/i18n.js — mini-i18n IT/EN (CommonJS, zero dipendenze).
 *
 * - `t(key, lang='it', vars={})`: chiavi nested `a.b.c`, interpolazione `{var}`,
 *   fallback a IT se la chiave manca nella lingua richiesta; se manca anche in
 *   IT ritorna la chiave stessa.
 * - `getLang(guildId)`: legge `language` da guildConfig (default 'it', valida
 *   solo 'it'/'en'). guildId nullo (DM) → 'it' senza toccare il DB.
 * - `setLang(guildId, lang)`: scrive via guildConfig.updateGuild; lancia su
 *   lingua non supportata.
 *
 * Ownership i18n: questo file + src/locales/*. Le descrizioni dei comandi
 * slash restano in IT (non localizzate via Discord) per scelta documentata.
 */

const SUPPORTED_LANGS = ['it', 'en'];
const FALLBACK_LANG = 'it';

const locales = {
  it: require('../locales/it'),
  en: require('../locales/en'),
};

function lookup(obj, key) {
  const parts = String(key).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
  );
}

function normalizeLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : FALLBACK_LANG;
}

/**
 * @param {string} key chiave nested es. 'ping.title'
 * @param {string} [lang='it']
 * @param {Object} [vars={}] valori per l'interpolazione `{var}`
 * @returns {string|*} stringa tradotta (o il valore non-stringa), mai undefined
 */
function t(key, lang = 'it', vars = {}) {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : FALLBACK_LANG;
  let val = lookup(locales[l], key);
  if (val === undefined && l !== FALLBACK_LANG) val = lookup(locales[FALLBACK_LANG], key);
  if (val === undefined) return key;
  if (typeof val !== 'string') return val;
  return interpolate(val, vars || {});
}

/** Lingua della guild ('it' default). Mai lancia per guildId nullo. */
function getLang(guildId) {
  if (!guildId) return FALLBACK_LANG;
  try {
    const guildConfig = require('../database/guildConfig');
    return normalizeLang(guildConfig.getGuild(guildId).language);
  } catch {
    return FALLBACK_LANG;
  }
}

/** Imposta la lingua della guild. Lancia Error se lang non supportata. */
function setLang(guildId, lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw new Error(`Lingua non supportata: ${lang} (attese: ${SUPPORTED_LANGS.join(', ')})`);
  }
  const guildConfig = require('../database/guildConfig');
  return guildConfig.updateGuild(guildId, { language: lang });
}

module.exports = { t, getLang, setLang, SUPPORTED_LANGS, FALLBACK_LANG };
