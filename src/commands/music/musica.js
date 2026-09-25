const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

// Tema premium condiviso, con fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c };
const themeBar = typeof T?.bar === 'function' ? T.bar : null;
const trunc = typeof T?.truncate === 'function' ? T.truncate : (s, m) => String(s ?? '').slice(0, m);
const applyFooter = typeof T?.applyFooter === 'function' ? T.applyFooter : (e, i) => {
  try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { e.setTimestamp(); } catch { /* ignora */ }
  return e;
};
const {
  MUSIC_UNAVAILABLE_MESSAGE,
  getPlayer,
  ensureExtractors,
  getQueue,
  getUpcomingTracks,
  mustBeInVoice,
  checkSameVoice,
  getQueryType,
  formatDuration,
  isTrackTooLong,
  cancelAutoLeave,
} = require('../../utils/player');

const QUERY_MAX = 200;
const QUEUE_SHOWN = 10;

function safeText(v, max) {
  return trunc(v, max);
}

async function replyEphemeral(interaction, content) {
  const data = { content };
  try {
    if (interaction.deferred) return await interaction.editReply(data);
    if (interaction.replied) return await interaction.followUp({ ...data, flags: MessageFlags.Ephemeral });
    return await interaction.reply({ ...data, flags: MessageFlags.Ephemeral });
  } catch {
    return null;
  }
}

async function replyEmbed(interaction, embed) {
  try {
    if (interaction.deferred) return await interaction.editReply({ embeds: [embed] });
    if (interaction.replied) return await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch {
    return null;
  }
}

function trackLine(track, index) {
  const title = safeText(track?.title ?? 'Sconosciuto', 60);
  const author = safeText(track?.author ?? '?', 40);
  const dur = safeText(track?.duration ?? '', 12);
  return `\`${index}.\` **${title}** — ${author}${dur ? ` \`${dur}\`` : ''}`;
}

function buildProgress(current, total, len = 12) {
  // FIX: riusa theme.bar (sicura su div0/NaN) invece di duplicarla.
  try {
    if (themeBar) {
      const s = themeBar(current, total, len);
      if (typeof s === 'string' && s.length > 0) return `\`[${s}]\``;
      return null;
    }
  } catch {
    return null;
  }
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(ratio * len);
  return `\`[${'█'.repeat(filled)}${'░'.repeat(len - filled)}]\``;
}

function setThumb(embed, track) {
  try {
    const t = track?.thumbnail;
    const url = typeof t === 'string' ? t : t?.url;
    if (typeof url === 'string' && /^https?:\/\//.test(url)) embed.setThumbnail(url);
  } catch {
    // ignora
  }
  return embed;
}

/** Testo via LRCLIB (gratis, senza chiave). null se assente. Mai lanciare. */
async function fetchLyrics(artist, title) {
  try {
    const a = String(artist || '').trim();
    const t = String(title || '').trim();
    if (!t) return null;
    const url = `https://lrclib.net/api/get?${a ? `artist_name=${encodeURIComponent(a)}&` : ''}track_name=${encodeURIComponent(t)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'discord-multi-server-bot' } });
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      const txt = j && typeof j.plainLyrics === 'string' ? j.plainLyrics.trim() : '';
      return txt || null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Enum repeat di discord-player con fallback numerico (dipendenze opzionali). */
function repeatModes() {
  try {
    const dp = require('discord-player');
    if (dp && dp.QueueRepeatMode) return dp.QueueRepeatMode;
  } catch {}
  return { OFF: 0, TRACK: 1, QUEUE: 2, AUTOPLAY: 3 };
}

function mapPlayError(e, query) {
  const msg = String(e?.message ?? e ?? '');
  if (/abort|timeout|timed out|ETIMEDOUT/i.test(msg)) return '⏱️ Ricerca scaduta per timeout. Riprova tra poco.';
  if (/no results|no_result|empty|not found|nessun risultato/i.test(msg)) {
    return `❌ Nessun risultato per **${safeText(query, 100)}**. Prova con un altro titolo o un link diretto.`;
  }
  if (/extract|failed to (load|fetch|retrieve)|no stream|no_stream|ERR_NO_STREAM|stream.*(unavailable|failed)|sign in to confirm|age.?restrict|private video|video unavailable|deleted|region.?lock|copyright|not available/i.test(msg)) {
    return `❌ Non riesco a estrarre l'audio per **${safeText(query, 100)}** (video non disponibile, privato, con restrizioni o fonte non supportata). Prova con un altro titolo o un link diretto.`;
  }
  if (/connect|speak|permission|permessi|join/i.test(msg)) {
    return '❌ Non riesco a entrare nel vocale: verifica i permessi **Connetti** e **Parla**.';
  }
  if (/opus|ffmpeg|sodium|voice connection/i.test(msg)) {
    return '❌ Audio vocale non disponibile su questo host (dipendenze mancanti).';
  }
  return `❌ Non riesco a riprodurre: ${safeText(msg, 180) || 'errore sconosciuto.'} Prova con un altro titolo o un link diretto.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('musica')
    .setDescription('Riproduci musica nel canale vocale (stile PeakBot)')
    .addSubcommand((s) =>
      s
        .setName('play')
        .setDescription('Riproduci un brano o aggiungilo in coda')
        .addStringOption((o) =>
          o
            .setName('query')
            .setDescription('Titolo, link YouTube/Spotify/SoundCloud… (max 200 caratteri)')
            .setMinLength(1)
            .setMaxLength(QUERY_MAX)
            .setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName('skip').setDescription('Salta il brano corrente'))
    .addSubcommand((s) => s.setName('stop').setDescription('Ferma la musica e svuota la coda'))
    .addSubcommand((s) => s.setName('coda').setDescription('Mostra la coda di riproduzione'))
    .addSubcommand((s) => s.setName('pausa').setDescription('Mette in pausa il brano corrente'))
    .addSubcommand((s) => s.setName('riprendi').setDescription('Riprende il brano in pausa'))
    .addSubcommand((s) =>
      s
        .setName('volume')
        .setDescription('Imposta il volume (0-100)')
        .addIntegerOption((o) =>
          o.setName('livello').setDescription('Volume da 0 a 100').setMinValue(0).setMaxValue(100).setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName('attuale').setDescription('Mostra il brano in riproduzione'))
    .addSubcommand((s) => s.setName('mescola').setDescription('Mescola la coda di riproduzione'))
    .addSubcommand((s) =>
      s.setName('ripeti').setDescription('Ripetizione: spenta, brano o coda')
        .addStringOption((o) => o.setName('modo').setDescription('Modalità').setRequired(true)
          .addChoices(
            { name: 'Spenta', value: 'off' },
            { name: '🔂 Brano', value: 'brano' },
            { name: '🔁 Coda', value: 'coda' },
          ))
    )
    .addSubcommand((s) => s.setName('testi').setDescription('Testo del brano in riproduzione'))
    .addSubcommand((s) => s.setName('cronologia').setDescription('Ultimi brani riprodotti in questo server')),
  cooldown: 3,

  async execute(interaction) {
    if (!interaction.guild) {
      return replyEphemeral(interaction, '❌ Usa questo comando dentro un server.');
    }

    const player = getPlayer(interaction.client);
    if (!player) {
      return replyEphemeral(interaction, MUSIC_UNAVAILABLE_MESSAGE);
    }

    const sub = interaction.options.getSubcommand();

    // ---- PLAY ----
    if (sub === 'play') {
      const { channel, error } = mustBeInVoice(interaction);
      if (error) return replyEphemeral(interaction, error);
      const query = interaction.options.getString('query', true).trim().slice(0, QUERY_MAX);
      if (!query) return replyEphemeral(interaction, '❌ Query vuota: scrivi un titolo o incolla un link.');

      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch {
        return null;
      }

      await ensureExtractors(player).catch(() => {});

      const playOptions = {
        nodeOptions: {
          metadata: interaction,
          selfDeaf: true,
          // Leave gestito manualmente da ensureVoiceHandlers (src/utils/player.js):
          // esce dopo 60s solo a coda finita E canale vuoto; a coda attiva resta.
          leaveOnEnd: false,
          leaveOnEmpty: false,
        },
        requestedBy: interaction.user,
      };
      const QueryType = getQueryType();
      if (QueryType?.AUTO) playOptions.searchEngine = QueryType.AUTO;
      if (typeof AbortSignal?.timeout === 'function') playOptions.signal = AbortSignal.timeout(25000);

      let res;
      try {
        res = await player.play(channel, query, playOptions);
      } catch (e) {
        return replyEphemeral(interaction, mapPlayError(e, query));
      }

      const track = res?.track;
      if (!track) {
        return replyEphemeral(interaction, `❌ Nessun risultato per **${safeText(query, 100)}**. Prova con un altro titolo o un link diretto.`);
      }
      // Cronologia server (best-effort, mai fatale).
      try {
        require('../../database/musicHistory').pushTrack(interaction.guild.id, {
          title: track.title, author: track.author, url: track.url, by: interaction.user.tag,
        });
      } catch {}
      const queue = res.queue ?? getQueue(player, interaction.guild.id);
      // Parte un brano: cancella un eventuale timer di auto-leave pendente.
      try {
        cancelAutoLeave(queue ?? interaction.guild.id);
      } catch {
        // ignora
      }
      const tooLong = isTrackTooLong(track.durationMS);
      const upcoming = queue ? getUpcomingTracks(queue) : [];
      const isCurrent = queue?.currentTrack?.title === track.title && upcoming.length === 0;

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(isCurrent ? '🎵 In riproduzione' : '➕ Aggiunto in coda')
        .setDescription(
          `[**${safeText(track.title, 120)}**](${track.url ?? 'https://discord.com/'})${track.author ? `\n👤 ${safeText(track.author, 80)}` : ''}`
        )
        .addFields(
          { name: '⏱️ Durata', value: safeText(track.duration ?? '—', 12), inline: true },
          {
            name: '📍 Posizione',
            value: isCurrent ? 'Adesso' : `#${upcoming.length}`,
            inline: true,
          },
          { name: '🙋 Richiesto da', value: `${track.requestedBy ?? interaction.user}`, inline: true }
        )
        .setFooter({ text: `Richiesto da ${interaction.user.tag}`.slice(0, 200) })
        .setTimestamp();
      setThumb(embed, track);

      const playlistCount = res?.searchResult?.playlist?.tracks?.length ?? 0;
      if (!isCurrent && playlistCount > 1) {
        embed.setFooter({ text: `Playlist: ${playlistCount} brani aggiunti • ${interaction.user.tag}`.slice(0, 200) });
      }
      if (tooLong) {
        embed.addFields({
          name: '⚠️ Brano molto lungo',
          value: 'Supera le **2 ore**: la riproduzione potrebbe interrompersi o consumare molta banda.',
        });
      }
      return replyEmbed(interaction, embed);
    }

    // ---- Tutti gli altri subcommand richiedono l'utente in vocale ----
    const { error: voiceError } = mustBeInVoice(interaction);
    if (voiceError) return replyEphemeral(interaction, voiceError);

    const queue = getQueue(player, interaction.guild.id);
    const current = queue?.currentTrack ?? null;

    // ---- CODA / ATTUALE: funzionano anche solo in lettura ----
    if (sub === 'coda') {
      const upcoming = getUpcomingTracks(queue);
      if (!current && upcoming.length === 0) {
        return replyEphemeral(interaction, '📭 La coda è vuota. Usa `/musica play` per iniziare!');
      }
      const lines = [];
      if (current) lines.push(`▶️ **In riproduzione:** ${trackLine(current, '•')}`);
      upcoming.slice(0, QUEUE_SHOWN).forEach((t, i) => lines.push(trackLine(t, i + 1)));
      const total = upcoming.length + (current ? 1 : 0);
      let totalTime = 0;
      try {
        for (const t of [current, ...upcoming]) totalTime += Number(t?.durationMS) || 0;
      } catch {
        // ignora
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📜 Coda di riproduzione')
        .setDescription(safeText(lines.join('\n'), 4000))
        .setFooter({
          text:
            (upcoming.length > QUEUE_SHOWN ? `…e altri ${upcoming.length - QUEUE_SHOWN} brani • ` : '') +
            `Totale: ${total} brano${total === 1 ? '' : 'i'}` +
            (totalTime > 0 ? ` • ${formatDuration(totalTime)}` : ''),
        })
        .setTimestamp();
      return replyEmbed(interaction, embed);
    }

    if (sub === 'attuale') {
      if (!current) return replyEphemeral(interaction, '❌ Niente in riproduzione al momento.');
      let bar = null;
      try {
        const ts = typeof queue.node?.getTimestamp === 'function' ? queue.node.getTimestamp() : null;
        const cur = ts?.current ?? ts?.progress ?? queue.node?.playbackTime;
        const tot = ts?.total ?? current?.durationMS;
        bar = buildProgress(Number(cur), Number(tot));
      } catch {
        bar = null;
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.warn)
        .setTitle('🎶 Brano attuale')
        .setDescription(
          `[**${safeText(current.title, 120)}**](${current.url ?? 'https://discord.com/'})${current.author ? `\n👤 ${safeText(current.author, 80)}` : ''}${bar ? `\n${bar}` : ''}`
        )
        .addFields(
          { name: '⏱️ Durata', value: safeText(current.duration ?? '—', 12), inline: true },
          { name: '🔊 Volume', value: `${Number(queue.node?.volume ?? 100)}%`, inline: true },
          { name: '🙋 Richiesto da', value: `${current.requestedBy ?? '?'}`, inline: true }
        )
        .setFooter({ text: `Richiesto da ${trunc(interaction.user.tag, 150)}` })
        .setTimestamp();
      setThumb(embed, current);
      return replyEmbed(interaction, embed);
    }

    if (sub === 'testi') {
      if (!current) return replyEphemeral(interaction, '❌ Niente in riproduzione al momento.');
      await interaction.deferReply().catch(() => null);
      if (!interaction.deferred && !interaction.replied) return;
      const lyrics = await fetchLyrics(current.author, current.title);
      if (!lyrics) {
        return interaction.editReply('❌ Testo non trovato per questo brano.').catch(() => {});
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📝 ${safeText(current.title, 200)}`.slice(0, 256))
        .setDescription(safeText(lyrics, 4000))
        .setFooter({ text: `Testo via LRCLIB • Richiesto da ${trunc(interaction.user.tag, 120)}` })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }

    if (sub === 'cronologia') {
      let list = [];
      try {
        list = require('../../database/musicHistory').recentTracks(interaction.guild.id, 10);
      } catch { list = []; }
      if (!list.length) return replyEphemeral(interaction, '📭 Nessun brano recente. Usa `/musica play`!');
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🕘 Ultimi brani')
        .setDescription(safeText(list.map((t, i) => `**${i + 1}.** [${safeText(t.title, 80)}](${t.url || 'https://discord.com/'})${t.author ? ` — ${safeText(t.author, 50)}` : ''}`).join('\n'), 4000))
        .setTimestamp();
      return replyEmbed(interaction, embed);
    }

    // ---- SKIP / STOP / PAUSA / RIPRENDI / VOLUME: serve una coda attiva ----
    if (!queue || !current) {
      return replyEphemeral(interaction, '❌ Niente in riproduzione. Usa `/musica play` per iniziare!');
    }
    const sameVoiceError = checkSameVoice(interaction, queue);
    if (sameVoiceError) return replyEphemeral(interaction, sameVoiceError);

    if (sub === 'skip') {
      let ok = false;
      try {
        ok = queue.node.skip();
      } catch {
        ok = false;
      }
      if (!ok) return replyEphemeral(interaction, '❌ Non riesco a saltare il brano. Riprova.');
      // FIX: non annunciare currentTrack subito dopo skip (potrebbe essere ancora il vecchio:
      // discord-player aggiorna in async) → messaggio senza titolo potenzialmente stale.
      return replyEphemeral(interaction, '⏭️ Brano saltato.');
    }

    if (sub === 'mescola') {
      try {
        if (typeof queue.tracks?.shuffle !== 'function') {
          return replyEphemeral(interaction, '❌ Mescolamento non supportato da questa versione del player.');
        }
        queue.tracks.shuffle();
      } catch {
        return replyEphemeral(interaction, '❌ Non riesco a mescolare. Riprova.');
      }
      return replyEphemeral(interaction, '🔀 Coda mescolata!');
    }

    if (sub === 'ripeti') {
      const modo = interaction.options.getString('modo', true);
      const RM = repeatModes();
      const target = modo === 'brano' ? RM.TRACK : modo === 'coda' ? RM.QUEUE : RM.OFF;
      try {
        if (typeof queue.setRepeatMode !== 'function') {
          return replyEphemeral(interaction, '❌ Ripetizione non supportata da questa versione del player.');
        }
        queue.setRepeatMode(target);
      } catch {
        return replyEphemeral(interaction, '❌ Non riesco a impostare la ripetizione. Riprova.');
      }
      const label = modo === 'brano' ? '🔂 Ripetizione brano attiva.' : modo === 'coda' ? '🔁 Ripetizione coda attiva.' : '➡️ Ripetizione spenta.';
      return replyEphemeral(interaction, label);
    }

    if (sub === 'stop') {
      try {
        try {
          queue.node.stop();
        } catch {
          // ignora: prova comunque a eliminare la coda
        }
        try {
          cancelAutoLeave(queue);
        } catch {
          // ignora
        }
        queue.delete();
      } catch {
        return replyEphemeral(interaction, '❌ Non riesco a fermare la riproduzione. Riprova.');
      }
      return replyEphemeral(interaction, '⏹️ Riproduzione fermata e coda svuotata. Alla prossima! 🎶');
    }

    if (sub === 'pausa') {
      let paused = false;
      try {
        paused = queue.node.isPaused();
      } catch {
        paused = false;
      }
      if (paused) return replyEphemeral(interaction, '⏸️ Il brano è già in pausa.');
      try {
        queue.node.setPaused(true);
      } catch {
        return replyEphemeral(interaction, '❌ Non riesco a mettere in pausa. Riprova.');
      }
      return replyEphemeral(interaction, '⏸️ Pausa. Usa `/musica riprendi` per continuare.');
    }

    if (sub === 'riprendi') {
      let paused = false;
      try {
        paused = queue.node.isPaused();
      } catch {
        paused = false;
      }
      if (!paused) return replyEphemeral(interaction, '▶️ Il brano non è in pausa.');
      try {
        queue.node.setPaused(false);
      } catch {
        return replyEphemeral(interaction, '❌ Non riesco a riprendere. Riprova.');
      }
      return replyEphemeral(interaction, '▶️ Riproduzione ripresa!');
    }

    if (sub === 'volume') {
      const livello = Math.max(0, Math.min(100, interaction.options.getInteger('livello', true)));
      let ok = false;
      try {
        ok = queue.node.setVolume(livello);
      } catch {
        ok = false;
      }
      if (!ok) return replyEphemeral(interaction, '❌ Non riesco a cambiare il volume. Riprova.');
      return replyEphemeral(interaction, `🔊 Volume impostato a **${livello}%**.`);
    }

    return replyEphemeral(interaction, '❌ Sottocomando sconosciuto.');
  },
};

// Export extra per test logica pura (non tocca data/cooldown/execute:
// toJSON e smoke test restano invariati).
module.exports.mapPlayError = mapPlayError;
module.exports.QUERY_MAX = QUERY_MAX;
