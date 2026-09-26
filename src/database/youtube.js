const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('youtube');

// Shape: { [guildId]: { feeds: [{ channelId, announceId, lastVideoId }] } }
const MAX_FEEDS = 10;

/** Estrae lo channel_id da ID nudo, URL /channel/ o URL youtu.be/user generici. */
function parseChannelId(input) {
  const t = String(input || '').trim();
  if (/^UC[A-Za-z0-9_-]{10,}$/.test(t)) return t;
  const m = /\/(?:channel\/)?(UC[A-Za-z0-9_-]{10,})/.exec(t);
  if (m) return m[1];
  return null;
}

function getFeeds(guildId) {
  try {
    const g = load(FILE)[guildId];
    return g && Array.isArray(g.feeds) ? g.feeds : [];
  } catch {
    return [];
  }
}

function addFeed(guildId, channelId, announceId) {
  const id = parseChannelId(channelId);
  if (!id) throw new Error('Canale non valido: incolla ID (UC…) o URL /channel/UC…');
  if (typeof announceId !== 'string' || !announceId) throw new Error('Canale annunci mancante.');
  const db = load(FILE);
  if (!db[guildId] || typeof db[guildId] !== 'object' || Array.isArray(db[guildId])) db[guildId] = { feeds: [] };
  const feeds = Array.isArray(db[guildId].feeds) ? db[guildId].feeds : [];
  if (feeds.some((f) => f.channelId === id)) return { dup: true, channelId: id };
  if (feeds.length >= MAX_FEEDS) throw new Error(`Max ${MAX_FEEDS} canali per server.`);
  feeds.push({ channelId: id, announceId, lastVideoId: null });
  db[guildId].feeds = feeds;
  save(FILE, db);
  return { channelId: id };
}

function removeFeed(guildId, channelId) {
  const id = parseChannelId(channelId) || String(channelId || '').trim();
  const db = load(FILE);
  const feeds = db[guildId] && Array.isArray(db[guildId].feeds) ? db[guildId].feeds : [];
  const next = feeds.filter((f) => f.channelId !== id);
  if (next.length === feeds.length) return false;
  db[guildId].feeds = next;
  save(FILE, db);
  return true;
}

function touchVideo(guildId, channelId, videoId) {
  try {
    const db = load(FILE);
    const feeds = db[guildId] && Array.isArray(db[guildId].feeds) ? db[guildId].feeds : [];
    const f = feeds.find((x) => x.channelId === channelId);
    if (!f) return;
    f.lastVideoId = videoId;
    save(FILE, db);
  } catch {}
}

module.exports = { parseChannelId, getFeeds, addFeed, removeFeed, touchVideo, MAX_FEEDS };
