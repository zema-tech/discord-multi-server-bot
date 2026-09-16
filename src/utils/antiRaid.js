/**
 * Tracker anti-raid in memoria (logica pura, nessuna dipendenza da discord.js).
 *
 * Conta i join per guild in una finestra scorrevole di 30 secondi:
 * `alert` diventa `true` quando si raggiungono 8+ join in 30s.
 * Non banna/kicka nessuno: segnala soltanto, la reazione spetta ai listener.
 */

const WINDOW_MS = 30 * 1000;
const THRESHOLD = 8;

// guildId -> timestamp[] (ms) dei join recenti
const joins = new Map();

function prune(guildId, now) {
  const list = joins.get(guildId);
  if (!list) return [];
  const fresh = list.filter((t) => now - t < WINDOW_MS);
  if (fresh.length === 0) joins.delete(guildId);
  else joins.set(guildId, fresh);
  return fresh;
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
  fresh.push(now);
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

module.exports = { registerJoin, isRaidLevel, reset, WINDOW_MS, THRESHOLD };
