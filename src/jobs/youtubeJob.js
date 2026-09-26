// youtubeJob.js — notifiche nuovi video via RSS pubblico (zero chiavi API).
// Poll ogni 15 minuti dei feed configurati (/youtube aggiungi). Unref dentro.

const { EmbedBuilder } = require('discord.js');
const { load, dbFile } = require('../database/jsonDb');

function rssUrl(channelId) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

/** Estrae [{ id, title, url }] dal feed (regex mirate, niente parser XML). */
function parseFeed(xml) {
  const out = [];
  const text = String(xml || '');
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(text)) !== null && out.length < 10) {
    const body = m[1];
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(body)?.[1]?.trim();
    const title = /<title>([^<]*)<\/title>/.exec(body)?.[1]?.trim();
    const link = /<link[^>]*href="([^"]+)"/.exec(body)?.[1]?.trim();
    if (id) out.push({ id, title: title || id, url: link || `https://youtu.be/${id}` });
  }
  return out;
}

async function fetchFeed(channelId, fetchFn = globalThis.fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 20000);
  try {
    const res = await fetchFn(rssUrl(channelId), { signal: ctrl.signal, headers: { 'User-Agent': 'discord-multi-server-bot' } });
    if (!res.ok) return null;
    return await res.text().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOnce(client, fetchFn = globalThis.fetch) {
  const announced = [];
  let db = null;
  try {
    db = load(dbFile('youtube'));
  } catch {
    return announced;
  }
  const { touchVideo } = require('../database/youtube');
  for (const gid of Object.keys(db)) {
    if (typeof gid !== 'string' || gid.startsWith('__')) continue;
    const feeds = db[gid] && Array.isArray(db[gid].feeds) ? db[gid].feeds : [];
    if (!feeds.length) continue;
    const guild = await client.guilds.fetch(gid).catch(() => null);
    if (!guild) continue;
    for (const feed of feeds) {
      try {
        const xml = await fetchFeed(feed.channelId, fetchFn);
        if (!xml) continue;
        const videos = parseFeed(xml);
        if (!videos.length) continue;
        if (!feed.lastVideoId) {
          // Prima sincronizzazione: marca l'ultimo, non spammare lo storico.
          touchVideo(gid, feed.channelId, videos[0].id);
          continue;
        }
        const fresh = [];
        for (const v of videos) {
          if (v.id === feed.lastVideoId) break;
          fresh.push(v);
        }
        if (!fresh.length) continue;
        touchVideo(gid, feed.channelId, videos[0].id);
        let channel = null;
        try {
          channel = await guild.channels.fetch(feed.announceId).catch(() => null);
          if (!channel?.isTextBased()) continue;
        } catch { continue; }
        for (const v of fresh.reverse().slice(0, 3)) {
          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(`🔴 Nuovo video: ${v.title.slice(0, 200)}`.slice(0, 256))
            .setURL(v.url)
            .setTimestamp();
          try {
            await channel.send({ content: `🎬 ${v.url}`, embeds: [embed] });
            announced.push({ guildId: gid, videoId: v.id });
          } catch {}
        }
      } catch (e) {
        console.error(`youtubeJob ${gid}:`, e.message);
      }
    }
  }
  return announced;
}

function startYoutubeJob(client, intervalMs = 15 * 60 * 1000) {
  const t = setTimeout(() => checkOnce(client).catch((e) => console.error('youtubeJob:', e)), 3 * 60 * 1000);
  t.unref?.();
  const iv = setInterval(() => checkOnce(client).catch((e) => console.error('youtubeJob:', e)), intervalMs);
  iv.unref?.();
  return iv;
}

module.exports = { startYoutubeJob, checkOnce, parseFeed, fetchFeed, rssUrl };
