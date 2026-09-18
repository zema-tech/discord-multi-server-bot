/**
 * snipeCache — cache in memoria dell'ultimo messaggio cancellato per canale.
 *
 * Chiave: `${guildId}:${channelId}` -> `{ authorTag, content, attachments, createdAt }`
 * TTL: 60s — le entry scadute vengono eliminate alla lettura e risultano "vuote".
 */

const TTL_SNIPE_MS = 60 * 1000;
// Tetti anti-leak: max entry totali (evict FIFO) e contenuto limitato.
const MAX_ENTRIES = 200;
const MAX_CONTENT_CHARS = 2000;

// Mappa interna (esposta come `_cache` solo per test/debug, non usare in produzione).
const cache = new Map();

function keyOf(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

/**
 * Salva l'ultimo messaggio cancellato di un canale.
 * @param {string} guildId
 * @param {string} channelId
 * @param {{ authorTag?: string, content?: string, attachments?: string[] }} data
 */
function setSnipe(guildId, channelId, data) {
  if (!guildId || !channelId) return;
  cache.set(keyOf(guildId, channelId), {
    authorTag: typeof data?.authorTag === 'string' && data.authorTag ? data.authorTag.slice(0, 100) : 'Sconosciuto',
    content: typeof data?.content === 'string' ? data.content.slice(0, MAX_CONTENT_CHARS) : '',
    attachments: Array.isArray(data?.attachments) ? data.attachments.filter(Boolean).slice(0, 10) : [],
    createdAt: Date.now(),
  });
  // Evict FIFO oltre il tetto (Map preserva l'ordine d'inserzione).
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * Recupera l'ultimo messaggio cancellato di un canale.
 * @returns {{ authorTag: string, content: string, attachments: string[], createdAt: number } | null}
 * Restituisce `null` se assente o scaduto (TTL 60s).
 */
function getSnipe(guildId, channelId) {
  if (!guildId || !channelId) return null;
  const key = keyOf(guildId, channelId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_SNIPE_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

/**
 * Pulisce la cache: un singolo canale se `channelId` è dato,
 * altrimenti tutti i canali della guild.
 */
function clearSnipe(guildId, channelId) {
  if (!guildId) return;
  if (!channelId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${guildId}:`)) cache.delete(key);
    }
    return;
  }
  cache.delete(keyOf(guildId, channelId));
}

module.exports = { TTL_SNIPE_MS, MAX_ENTRIES, MAX_CONTENT_CHARS, setSnipe, getSnipe, clearSnipe, _cache: cache };
