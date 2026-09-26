// birthdayJob.js — auguri giornalieri (una volta al giorno per server).
// Annuncia nel canale configurato (/compleanno canale) o nel system channel.
// Unref dentro: mai bloccare boot/exit.

const { EmbedBuilder } = require('discord.js');
const { load, save, dbFile } = require('../database/jsonDb');

const DAY_MS = 24 * 60 * 60 * 1000;

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function guildIds() {
  try {
    const db = load(dbFile('birthdays'));
    return Object.keys(db).filter((k) => typeof k === 'string' && !k.startsWith('__'));
  } catch {
    return [];
  }
}

async function checkOnce(client, date = new Date()) {
  const done = [];
  const key = todayKey(date);
  let db = null;
  try {
    db = load(dbFile('birthdays'));
  } catch {
    return done;
  }
  const { birthdaysOn } = require('../database/birthdays');
  for (const gid of guildIds()) {
    try {
      const g = db[gid];
      if (!g || g.lastRun === key) continue;
      const guild = await client.guilds.fetch(gid).catch(() => null);
      if (!guild) continue;
      const celebrati = birthdaysOn(gid, date);
      g.lastRun = key;
      try {
        save(dbFile('birthdays'), db);
      } catch {}
      if (!celebrati.length) continue;
      let channel = null;
      try {
        if (g.channelId) channel = await guild.channels.fetch(g.channelId).catch(() => null);
        if (!channel?.isTextBased()) channel = guild.systemChannel?.isTextBased() ? guild.systemChannel : null;
      } catch {}
      if (!channel) continue;
      for (const b of celebrati) {
        const embed = new EmbedBuilder()
          .setColor(0xff73fa)
          .setTitle('🎂 Buon compleanno!')
          .setDescription(`Tanti auguri <@${b.userId}>! 🎉🎁\nTutta la community ti festeggia!`)
          .setTimestamp();
        try {
          await channel.send({ content: `🎂 <@${b.userId}>`, embeds: [embed] });
          done.push({ guildId: gid, userId: b.userId });
        } catch {}
      }
    } catch (e) {
      console.error(`birthdayJob ${gid}:`, e.message);
    }
  }
  return done;
}

function startBirthdayJob(client, intervalMs = DAY_MS) {
  const t = setTimeout(() => checkOnce(client).catch((e) => console.error('birthdayJob:', e)), 2 * 60 * 1000);
  t.unref?.();
  const iv = setInterval(() => checkOnce(client).catch((e) => console.error('birthdayJob:', e)), intervalMs);
  iv.unref?.();
  return iv;
}

module.exports = { startBirthdayJob, checkOnce, todayKey };
