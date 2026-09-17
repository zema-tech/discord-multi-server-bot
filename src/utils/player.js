// Singleton discord-player + helper per i comandi vocali (stile PeakBot).
// TUTTO il require di dipendenze vocali avviene in try/catch: se i moduli
// non sono installati su questo host, getPlayer() restituisce null e i
// comandi rispondono con MUSIC_UNAVAILABLE_MESSAGE (nessun crash del bot).

const { PermissionFlagsBits } = require('discord.js');

const MUSIC_UNAVAILABLE_MESSAGE = '🎵 Modulo musica non installato su questo host.';

let cachedPlayer = null;
let cachedPlayerClient = null;
let modulesState = null; // { Player, QueryType } una volta caricati con successo
let extractorsPromise = null;

function tryLoadModules() {
  if (modulesState) return modulesState;
  try {
    const dp = require('discord-player');
    if (!dp || typeof dp.Player !== 'function') return null;
    modulesState = { Player: dp.Player, QueryType: dp.QueryType ?? null };
    return modulesState;
  } catch {
    return null;
  }
}

function isMusicAvailable() {
  return !!tryLoadModules();
}

function getQueryType() {
  return tryLoadModules()?.QueryType ?? null;
}

// Carica gli extractor (bundle standard + YouTube separato). Idempotente:
// ritorna sempre la stessa promise. Mai lanciare: errori solo in console.
function ensureExtractors(player) {
  if (!player) return Promise.resolve(false);
  if (player.__peakbotExtractorsReady) return Promise.resolve(true);
  if (extractorsPromise) return extractorsPromise;
  extractorsPromise = (async () => {
    try {
      const ext = require('@discord-player/extractor');
      const bundle = ext ? ext.DefaultExtractors : null;
      if (Array.isArray(bundle) && typeof player.extractors?.loadMulti === 'function') {
        await player.extractors.loadMulti(bundle);
      }
    } catch (e) {
      console.warn('[musica] DefaultExtractors non caricati:', e?.message ?? e);
    }
    try {
      const yt = require('discord-player-youtubei');
      const YT = yt ? yt.YoutubeExtractor ?? yt.YoutubeiExtractor ?? yt.default : null;
      if (typeof YT === 'function' && typeof player.extractors?.register === 'function') {
        await player.extractors.register(YT, {});
      }
    } catch (e) {
      console.warn('[musica] YoutubeExtractor non caricato:', e?.message ?? e);
    }
    try {
      player.__peakbotExtractorsReady = true;
    } catch {
      // ignora: flag best-effort
    }
    return true;
  })();
  return extractorsPromise;
}

// Singleton lazy del Player. Restituisce null se le dipendenze mancano.
function getPlayer(client) {
  if (!client) return null;
  if (cachedPlayer && cachedPlayerClient === client) return cachedPlayer;
  const mods = tryLoadModules();
  if (!mods) return null;
  try {
    const player = new mods.Player(client);
    cachedPlayer = player;
    cachedPlayerClient = client;
    // Pre-caricamento extractor in background (il play li attende comunque).
    ensureExtractors(player).catch(() => {});
    return player;
  } catch (e) {
    console.error('[musica] getPlayer fallito:', e?.message ?? e);
    return null;
  }
}

// Coda della guild (o null). Mai lanciare.
function getQueue(player, guildId) {
  try {
    return player?.nodes?.get?.(guildId) ?? null;
  } catch {
    return null;
  }
}

// Brani in attesa (escluso quello corrente). Gestisce le varie forme
// dello store a seconda della versione di discord-player. Mai lanciare.
function getUpcomingTracks(queue) {
  try {
    const t = queue?.tracks;
    if (!t) return [];
    if (Array.isArray(t)) return t;
    if (typeof t.toArray === 'function') return t.toArray();
    if (typeof t.values === 'function') return [...t.values()];
    if (Array.isArray(t.store)) return t.store;
    return [];
  } catch {
    return [];
  }
}

// L'utente deve stare in un vocale; il bot deve avere Connect + Speak lì.
// Ritorna { channel, error }: se error != null il comando deve rispondere
// con quell'errore e fermarsi. Il join/spostamento lo gestisce discord-player.
function mustBeInVoice(interaction) {
  const channel = interaction?.member?.voice?.channel ?? null;
  if (!channel) {
    return { channel: null, error: '❌ Devi essere in un **canale vocale** per usare questo comando.' };
  }
  try {
    const me = interaction.guild?.members?.me ?? null;
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms && (!perms.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak))) {
      return {
        channel: null,
        error: '❌ Non ho i permessi **Connetti** e/o **Parla** in quel canale vocale. Chiedi a un admin di sistemarli.',
      };
    }
  } catch {
    // fail-open: eventuali errori di connessione emergono graceful nel play
  }
  return { channel, error: null };
}

// Per skip/stop/pausa/ecc: l'utente deve stare nella STESSA vocale del bot.
// Ritorna stringa errore oppure null. Mai lanciare.
function checkSameVoice(interaction, queue) {
  try {
    const botChannel = queue?.channel ?? null;
    const myChannel = interaction?.member?.voice?.channel ?? null;
    if (botChannel && myChannel && botChannel.id !== myChannel.id) {
      return '❌ Devi essere nel mio stesso canale vocale per controllare la musica.';
    }
  } catch {
    // ignora
  }
  return null;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  MUSIC_UNAVAILABLE_MESSAGE,
  getPlayer,
  ensureExtractors,
  getQueue,
  getUpcomingTracks,
  mustBeInVoice,
  checkSameVoice,
  isMusicAvailable,
  getQueryType,
  formatDuration,
};
