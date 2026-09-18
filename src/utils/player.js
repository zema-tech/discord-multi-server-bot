// Singleton discord-player + helper per i comandi vocali (stile PeakBot).
// TUTTO il require di dipendenze vocali avviene in try/catch: se i moduli
// non sono installati su questo host, getPlayer() restituisce null e i
// comandi rispondono con MUSIC_UNAVAILABLE_MESSAGE (nessun crash del bot).

const { PermissionFlagsBits } = require('discord.js');

const MUSIC_UNAVAILABLE_MESSAGE = '🎵 Modulo musica non installato su questo host.';

// Costanti robustezza voce (pure, testabili senza dipendenze vocali).
// AUTO_LEAVE_DELAY_MS: attesa prima di uscire quando la coda è finita
// E il canale è vuoto (solo bot). MAX_TRACK_MS: soglia avviso brano lungo.
const AUTO_LEAVE_DELAY_MS = 60 * 1000;
const MAX_TRACK_MS = 2 * 60 * 60 * 1000;

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
    // Robustezza voce: auto-leave, cleanup disconnessioni, error-log (idempotente).
    try {
      ensureVoiceHandlers(player);
    } catch {
      // ignora: il player resta utilizzabile anche senza handler
    }
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
// Check esplicito PRIMA di qualsiasi join: elenca il permesso mancante.
function mustBeInVoice(interaction) {
  const channel = interaction?.member?.voice?.channel ?? null;
  if (!channel) {
    return { channel: null, error: '❌ Devi essere in un **canale vocale** per usare questo comando.' };
  }
  try {
    const me = interaction.guild?.members?.me ?? null;
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms) {
      const missing = [];
      if (!perms.has(PermissionFlagsBits.Connect)) missing.push('**Connetti**');
      if (!perms.has(PermissionFlagsBits.Speak)) missing.push('**Parla**');
      if (missing.length > 0) {
        return {
          channel: null,
          error: `❌ Non ho il permesso ${missing.join(' e ')} in ${channel}. Chiedi a un admin di sistemarlo prima che entri nel vocale.`,
        };
      }
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

// ---- Logica pura robustezza voce (nessuna dipendenza vocale: testabile) ----

// true se la durata supera la soglia (default 2h). Accetta number/stringhe.
function isTrackTooLong(durationMS, maxMs = MAX_TRACK_MS) {
  const ms = Number(durationMS);
  const max = Number(maxMs);
  if (!Number.isFinite(ms) || ms < 0) return false;
  if (!Number.isFinite(max) || max <= 0) return false;
  return ms > max;
}

// Conta i membri NON-bot nel canale vocale. Ritorna null se non determinabile
// (fail-open: in caso di dubbio il bot RESTA nel vocale, mai leave aggressivi).
function countRealMembers(channel) {
  try {
    const members = channel?.members;
    if (!members) return null;
    const list = typeof members.filter === 'function'
      ? members.filter((m) => !m?.user?.bot)
      : typeof members.values === 'function'
        ? [...members.values()].filter((m) => !m?.user?.bot)
        : Array.isArray(members)
          ? members.filter((m) => !m?.user?.bot)
          : null;
    if (!list) return null;
    const size = typeof list.size === 'number' ? list.size : list.length;
    return typeof size === 'number' ? size : null;
  } catch {
    return null;
  }
}

// true solo se nel canale è rimasto il bot da solo (0 membri reali).
// Sconosciuto (null) -> false: mai buttare fuori il bot per un dubbio.
function isChannelEmptyForBot(channel) {
  return countRealMembers(channel) === 0;
}

// true solo quando la coda è finita (niente corrente, niente in attesa)
// E non c'è più nessuno nel vocale: l'unico caso in cui si schedula l'leave.
// A coda attiva (sta suonando) ritorna sempre false: il bot resta.
function shouldScheduleAutoLeave({ currentTrack, upcomingCount, realMembers }) {
  const upcoming = Number(upcomingCount) || 0;
  if (currentTrack != null) return false;
  if (upcoming > 0) return false;
  if (realMembers !== 0) return false;
  return true;
}

// ---- Timer auto-leave (guildId -> Timeout con unref: mai tenere vivo Node) ----

const autoLeaveTimers = new Map(); // guildId -> Timeout

function getAutoLeaveGuildId(queueOrId) {
  if (typeof queueOrId === 'string') return queueOrId;
  try {
    return queueOrId?.guild?.id ?? queueOrId?.guildId ?? null;
  } catch {
    return null;
  }
}

// Cancella il timer di leave pendente per la guild. Mai lanciare.
function cancelAutoLeave(queueOrId) {
  try {
    const guildId = getAutoLeaveGuildId(queueOrId);
    if (!guildId) return false;
    const t = autoLeaveTimers.get(guildId);
    if (!t) return false;
    try {
      clearTimeout(t);
    } catch {
      // ignora
    }
    autoLeaveTimers.delete(guildId);
    return true;
  } catch {
    return false;
  }
}

// Schedula l'uscita dal vocale dopo delayMs (default 60s). Ricontrolla allo
// scoccare: esce solo se la coda è ancora finita E il canale è ancora vuoto;
// altrimenti (rientrata gente o ripartito un brano) resta. Mai lanciare.
function scheduleAutoLeave(queue, delayMs = AUTO_LEAVE_DELAY_MS) {
  try {
    const guildId = getAutoLeaveGuildId(queue);
    if (!guildId) return null;
    cancelAutoLeave(guildId);
    const delay = Number(delayMs) > 0 ? Number(delayMs) : AUTO_LEAVE_DELAY_MS;
    const t = setTimeout(() => {
      autoLeaveTimers.delete(guildId);
      try {
        const upcoming = getUpcomingTracks(queue);
        const channel = queue?.channel ?? null;
        const done = !queue?.currentTrack && upcoming.length === 0;
        if (done && isChannelEmptyForBot(channel)) {
          try {
            queue.delete();
          } catch {
            try {
              queue?.connection?.destroy?.();
            } catch {
              // ignora
            }
          }
        }
      } catch {
        // ignora: mai crashare dal timer
      }
    }, delay);
    try {
      if (typeof t?.unref === 'function') t.unref();
    } catch {
      // ignora
    }
    autoLeaveTimers.set(guildId, t);
    return t;
  } catch {
    return null;
  }
}

// Pulizia coda+stato dopo disconnessione/kick: cancella il timer e prova a
// eliminare la coda. Mai lanciare, mai propagare errori.
function cleanupQueueVoice(queue) {
  try {
    cancelAutoLeave(queue);
  } catch {
    // ignora
  }
  try {
    if (queue) queue.delete();
  } catch {
    try {
      queue?.connection?.destroy?.();
    } catch {
      // ignora
    }
  }
  return true;
}

// Nomi evento coda discord-player v7 (enum GuildQueueEvent quando disponibile,
// fallback ai letterali: i valori dell'enum sono le stesse stringhe).
function resolveQueueEventNames() {
  const fallback = {
    emptyQueue: 'emptyQueue',
    emptyChannel: 'emptyChannel',
    channelPopulate: 'channelPopulate',
    playerStart: 'playerStart',
    audioTrackAdd: 'audioTrackAdd',
    audioTracksAdd: 'audioTracksAdd',
    connectionDestroyed: 'connectionDestroyed',
    disconnect: 'disconnect',
    error: 'error',
    playerError: 'playerError',
  };
  try {
    const dp = require('discord-player');
    const E = dp?.GuildQueueEvent ?? null;
    if (!E) return fallback;
    return {
      emptyQueue: E.EmptyQueue ?? fallback.emptyQueue,
      emptyChannel: E.EmptyChannel ?? fallback.emptyChannel,
      channelPopulate: E.ChannelPopulate ?? fallback.channelPopulate,
      playerStart: E.PlayerStart ?? fallback.playerStart,
      audioTrackAdd: E.AudioTrackAdd ?? fallback.audioTrackAdd,
      audioTracksAdd: E.AudioTracksAdd ?? fallback.audioTracksAdd,
      connectionDestroyed: E.ConnectionDestroyed ?? fallback.connectionDestroyed,
      disconnect: E.Disconnect ?? fallback.disconnect,
      error: E.Error ?? fallback.error,
      playerError: E.PlayerError ?? fallback.playerError,
    };
  } catch {
    return fallback;
  }
}

// Registra UNA volta sola gli handler voce sul player (idempotente):
// - coda finita + canale vuoto -> leave dopo 60s (cancellabile)
// - canale ripopolato / brano che parte / tracce aggiunte -> cancella timer
// - bot disconnesso/kickato -> pulizia coda e stato, senza crash
// - errori player/coda -> solo log, mai crash
// Mai lanciare.
function ensureVoiceHandlers(player) {
  try {
    if (!player || !player.events || typeof player.events.on !== 'function') return false;
    if (player.__peakbotVoiceRobustness) return true;
    const EV = resolveQueueEventNames();
    const on = (event, fn) => {
      try {
        player.events.on(event, (...args) => {
          try {
            fn(...args);
          } catch (e) {
            console.error(`[musica] handler "${event}":`, e?.message ?? e);
          }
        });
      } catch {
        // ignora: un singolo evento non deve bloccare gli altri
      }
    };

    // Coda svuotata: esci SOLO se anche il canale è vuoto (solo bot).
    on(EV.emptyQueue, (queue) => {
      try {
        const upcoming = getUpcomingTracks(queue);
        const channel = queue?.channel ?? null;
        if (shouldScheduleAutoLeave({
          currentTrack: queue?.currentTrack ?? null,
          upcomingCount: upcoming.length,
          realMembers: countRealMembers(channel),
        })) {
          scheduleAutoLeave(queue);
        } else {
          cancelAutoLeave(queue);
        }
      } catch {
        // ignora
      }
    });

    // Canale svuotato mentre la coda è attiva: RESTA (sta suonando).
    // Se per qualche ragione la coda è già finita, schedula l'leave.
    on(EV.emptyChannel, (queue) => {
      try {
        const upcoming = getUpcomingTracks(queue);
        const hasActive = queue?.currentTrack != null || upcoming.length > 0;
        if (hasActive) {
          cancelAutoLeave(queue);
        } else {
          scheduleAutoLeave(queue);
        }
      } catch {
        // ignora
      }
    });

    // Rientra gente o parte un brano: cancella il leave pendente.
    on(EV.channelPopulate, (queue) => cancelAutoLeave(queue));
    on(EV.playerStart, (queue) => cancelAutoLeave(queue));
    on(EV.audioTrackAdd, (queue) => cancelAutoLeave(queue));
    on(EV.audioTracksAdd, (queue) => cancelAutoLeave(queue));

    // Bot disconnesso/kickato dalla vocale: pulisci coda e stato, senza crash.
    on(EV.connectionDestroyed, (queue) => cleanupQueueVoice(queue));
    on(EV.disconnect, (queue) => cleanupQueueVoice(queue));

    // Errori: solo log, mai crash del bot.
    on(EV.error, (queue, error) => {
      try {
        console.error('[musica] queue error:', error?.message ?? error);
      } catch {
        // ignora
      }
    });
    on(EV.playerError, (queue, error) => {
      try {
        console.error('[musica] player error:', error?.message ?? error);
      } catch {
        // ignora
      }
    });

    try {
      player.__peakbotVoiceRobustness = true;
    } catch {
      // ignora: flag best-effort
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MUSIC_UNAVAILABLE_MESSAGE,
  AUTO_LEAVE_DELAY_MS,
  MAX_TRACK_MS,
  getPlayer,
  ensureExtractors,
  ensureVoiceHandlers,
  getQueue,
  getUpcomingTracks,
  mustBeInVoice,
  checkSameVoice,
  isMusicAvailable,
  getQueryType,
  formatDuration,
  isTrackTooLong,
  countRealMembers,
  isChannelEmptyForBot,
  shouldScheduleAutoLeave,
  scheduleAutoLeave,
  cancelAutoLeave,
  cleanupQueueVoice,
};
