// statChannelsJob.js — aggiorna i nomi dei canali statistica ogni 10 minuti.
// Conteggi best-effort dalla cache (online = presenze in cache, può essere
// parziale senza intenti privilegiati). Unref dentro.

const { ChannelType } = require('discord.js');
const { load, dbFile } = require('../database/jsonDb');

function guildIds() {
  try {
    const db = load(dbFile('statChannels'));
    return Object.keys(db).filter((k) => typeof k === 'string' && !k.startsWith('__'));
  } catch {
    return [];
  }
}

async function refreshOne(guild) {
  try {
    const store = require('../database/statChannels');
    const cfg = store.get(guild.id);
    if (!cfg.membersId && !cfg.onlineId && !cfg.botsId) return false;
    let members = guild.memberCount ?? 0;
    let online = 0;
    let bots = 0;
    try {
      const cache = guild.members?.cache;
      if (cache && cache.size) {
        members = guild.memberCount ?? cache.size;
        for (const [, m] of cache) {
          if (m.user?.bot) bots += 1;
          else if (m.presence && m.presence.status !== 'offline') online += 1;
        }
      }
    } catch {}
    const rename = async (id, name) => {
      if (!id) return;
      try {
        const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
        if (!ch) {
          try {
            const s2 = require('../database/statChannels');
            const c2 = s2.get(guild.id);
            const next = { ...c2 };
            for (const k of ['membersId', 'onlineId', 'botsId']) if (next[k] === id) next[k] = null;
            s2.set(guild.id, next);
          } catch {}
          return;
        }
        if (ch.name !== name) await ch.setName(name.slice(0, 100)).catch(() => {});
      } catch {}
    };
    await rename(cfg.membersId, `👥 Membri: ${members}`);
    await rename(cfg.onlineId, `🟢 Online: ${online}`);
    await rename(cfg.botsId, `🤖 Bot: ${bots}`);
    return true;
  } catch {
    return false;
  }
}

async function checkOnce(client) {
  let n = 0;
  for (const gid of guildIds()) {
    try {
      const guild = await client.guilds.fetch(gid).catch(() => null);
      if (!guild) continue;
      if (await refreshOne(guild)) n += 1;
    } catch (e) {
      console.error(`statChannels ${gid}:`, e.message);
    }
  }
  return n;
}

function startStatChannelsJob(client, intervalMs = 10 * 60 * 1000) {
  const t = setTimeout(() => checkOnce(client).catch((e) => console.error('statChannels:', e)), 60 * 1000);
  t.unref?.();
  const iv = setInterval(() => checkOnce(client).catch((e) => console.error('statChannels:', e)), intervalMs);
  iv.unref?.();
  return iv;
}

module.exports = { startStatChannelsJob, checkOnce, refreshOne };
