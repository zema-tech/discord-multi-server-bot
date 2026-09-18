/**
 * Tracker anti-raid in memoria (logica pura, nessuna dipendenza da discord.js).
 *
 * Conta i join per guild in una finestra scorrevole di 30 secondi:
 * `alert` diventa `true` quando si raggiungono 8+ join in 30s.
 * Non banna/kicka nessuno: segnala soltanto, la reazione spetta ai listener.
 */

const WINDOW_MS = 30 * 1000;
const THRESHOLD = 8;
// Tetto anti-memoria: dentro la finestra non serve tenere più di N timestamp.
const MAX_TRACKED = 500;

// guildId -> timestamp[] (ms) dei join recenti
const joins = new Map();

// Timestamp valido o fallback a Date.now(): un NaN avvelenerebbe la finestra
// (NaN non viene mai potato dal filtro e resta in memoria per sempre).
function asNow(now) {
  return Number.isFinite(now) ? now : Date.now();
}

function prune(guildId, now) {
  const list = joins.get(guildId);
  if (!list) return [];
  const ts = asNow(now);
  const fresh = list.filter((t) => Number.isFinite(t) && ts - t < WINDOW_MS);
  if (fresh.length === 0) joins.delete(guildId);
  else joins.set(guildId, fresh.length > MAX_TRACKED ? fresh.slice(-MAX_TRACKED) : fresh);
  return fresh.length > MAX_TRACKED ? fresh.slice(-MAX_TRACKED) : fresh;
}

/**
 * Registra un join e restituisce lo stato della finestra.
 * @param {string} guildId
 * @param {number} [now] timestamp in ms (default Date.now(), parametrico per i test)
 * @returns {{ count: number, alert: boolean }}
 */
function registerJoin(guildId, now = Date.now()) {
  if (!guildId) return { count: 0, alert: false };
  const fresh = prune(guildId, now);
  fresh.push(asNow(now));
  joins.set(guildId, fresh);
  return { count: fresh.length, alert: fresh.length >= THRESHOLD };
}

/**
 * Dice se la guild è attualmente in condizione di raid (8+ join negli ultimi 30s).
 * @param {string} guildId
 * @param {number} [now] timestamp in ms (default Date.now(), parametrico per i test)
 * @returns {boolean}
 */
function isRaidLevel(guildId, now = Date.now()) {
  if (!guildId) return false;
  return prune(guildId, now).length >= THRESHOLD;
}

/** Dimentica lo storico join di una guild. */
function reset(guildId) {
  if (guildId) joins.delete(guildId);
}

/** Dimentica lo storico join di TUTTE le guild (shutdown/test, anti-leak). */
function resetAll() {
  joins.clear();
}

module.exports = { registerJoin, isRaidLevel, reset, resetAll, WINDOW_MS, THRESHOLD };
