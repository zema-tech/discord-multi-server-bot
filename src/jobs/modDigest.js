// modDigest.js — report giornaliero moderazione (stile Lucky digest).
// Ogni 24h (prima passata dopo 5 minuti): casi + warn delle ultime 24h
// inviati nel canale log del server. Mai crashare il boot.

const { EmbedBuilder } = require('discord.js');
const { load, dbFile } = require('../database/jsonDb');

const DAY_MS = 24 * 60 * 60 * 1000;

function readDbGuildIds() {
  const ids = new Set();
  for (const name of ['cases', 'warnings']) {
    try {
      const db = load(dbFile(name));
      for (const k of Object.keys(db)) {
        if (typeof k === 'string' && !k.startsWith('__') && !k.startsWith('qatest') && !k.startsWith('w1test') && !k.startsWith('gtest')) {
          ids.add(k);
        }
      }
    } catch {}
  }
  return [...ids];
}

function lastDayCases(guildId, now) {
  let items = [];
  try {
    const db = load(dbFile('cases'));
    const g = db[guildId];
    const all = g && typeof g.items === 'object' ? Object.values(g.items) : [];
    items = all.filter((c) => c && Number.isFinite(c.at) && now - c.at < DAY_MS);
  } catch {}
  return items;
}

function lastDayWarns(guildId, now) {
  let count = 0;
  try {
    const db = load(dbFile('warnings'));
    const g = db[guildId];
    if (g && typeof g === 'object') {
      for (const [uid, list] of Object.entries(g)) {
        if (uid === 'actions' || !Array.isArray(list)) continue;
        for (const w of list) {
          if (w && Number.isFinite(w.at) && now - w.at < DAY_MS) count += 1;
        }
      }
    }
  } catch {}
  return count;
}

async function checkOnce(client) {
  const sent = [];
  const guildIds = new Set([...(client.guilds?.cache?.keys() || []), ...readDbGuildIds()]);
  const now = Date.now();
  for (const guildId of guildIds) {
    try {
      const cases = lastDayCases(guildId, now);
      const warns = lastDayWarns(guildId, now);
      if (!cases.length && !warns) continue;
      const byType = {};
      for (const c of cases) byType[c.type || 'note'] = (byType[c.type || 'note'] || 0) + 1;
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🛡️ Digest moderazione (24h)')
        .setDescription(
          `Casi: **${cases.length}**${Object.keys(byType).length ? ` (${Object.entries(byType).map(([t, n]) => `${t}: ${n}`).join(', ')})` : ''}\n` +
          `Warn: **${warns}**`
        )
        .setTimestamp();
      try {
        const { sendLog } = require('../utils/helpers');
        await sendLog(guild, { embeds: [embed] });
        sent.push(guildId);
      } catch {}
    } catch (e) {
      console.error(`modDigest ${guildId}:`, e.message);
    }
  }
  return sent;
}

function startModDigest(client, intervalMs = DAY_MS) {
  const t = setTimeout(() => checkOnce(client).catch((e) => console.error('modDigest:', e)), 5 * 60 * 1000);
  t.unref?.();
  const iv = setInterval(() => checkOnce(client).catch((e) => console.error('modDigest:', e)), intervalMs);
  iv.unref?.();
  return iv;
}

module.exports = { startModDigest, checkOnce, lastDayCases, lastDayWarns };
