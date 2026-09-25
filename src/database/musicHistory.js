const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('musicHistory');

const MAX_TRACKS = 20;

/** Ultimi brani di un server (più recenti prima). Mai lanciare. */
function recentTracks(guildId, limit = 10) {
  try {
    const db = load(FILE);
    const list = db[guildId];
    if (!Array.isArray(list)) return [];
    const n = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(MAX_TRACKS, Number(limit))) : 10;
    return list.slice(0, n);
  } catch {
    return [];
  }
}

/** Registra un brano (deduplica consecutivi). Mai lanciare. */
function pushTrack(guildId, { title, author, url, by } = {}) {
  try {
    if (!guildId) return;
    const t = String(title || '').trim().slice(0, 200);
    if (!t) return;
    const db = load(FILE);
    const list = Array.isArray(db[guildId]) ? db[guildId] : [];
    if (list[0] && list[0].title === t && list[0].url === String(url || '')) return;
    list.unshift({
      title: t,
      author: String(author || '').slice(0, 120),
      url: String(url || '').slice(0, 500),
      by: String(by || '').slice(0, 64),
      at: Date.now(),
    });
    db[guildId] = list.slice(0, MAX_TRACKS);
    save(FILE, db);
  } catch {}
}

module.exports = { recentTracks, pushTrack, MAX_TRACKS };
