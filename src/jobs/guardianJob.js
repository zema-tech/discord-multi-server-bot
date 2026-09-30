// guardianJob.js — sistema immunitario: drena i segnali dolore del registry
// e avvisa lo staff nel canale log. FEBBRE: >=3 moduli isolati in un server
// -> avviso speciale (max 1/ora per server). Unref dentro.

const { EmbedBuilder } = require('discord.js');

const FEVER_THRESHOLD = 3;
const FEVER_COOLDOWN_MS = 60 * 60 * 1000;
const feverNotified = new Map(); // guildId -> timestamp

function pruneFever() {
  try {
    const now = Date.now();
    for (const [gid, t] of feverNotified) {
      if (now - t > FEVER_COOLDOWN_MS * 2) feverNotified.delete(gid);
    }
    if (feverNotified.size > 5000) feverNotified.clear();
  } catch {}
}

async function checkOnce(client) {
  const done = [];
  let registry = null;
  try {
    registry = require('../modules/registry');
  } catch {
    return done;
  }
  let alerts = [];
  try {
    alerts = registry.drainAlerts() || [];
  } catch {}
  const { sendLog } = (() => {
    try {
      return require('../utils/helpers');
    } catch {
      return {};
    }
  })();
  if (typeof sendLog !== 'function') return done;

  for (const a of alerts) {
    try {
      const guild = await client.guilds.fetch(a.guildId).catch(() => null);
      if (!guild) continue;
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`🛡️ Modulo in protezione: ${a.featureId}`)
        .setDescription(
          'Il Commander lo ha isolato dopo errori ripetuti: i suoi comandi ' +
          'rispondono con un messaggio di protezione, il resto funziona.\n' +
          `Ultimo errore: \`${String(a.message || 'sconosciuto').slice(0, 200)}\`\n` +
          'Recupero: `/modulo reload nome` oppure riattivalo (azzera tutto).'
        )
        .setTimestamp();
      await sendLog(guild, { embeds: [embed] });
      done.push({ guildId: a.guildId, featureId: a.featureId });
    } catch (e) {
      console.error(`guardian ${a.guildId}:`, e.message);
    }
  }

  // FEBBRE: conta gli isolati per server tra i guild del bot.
  try {
    pruneFever();
    const now = Date.now();
    const guilds = [...(client.guilds?.cache?.values() || [])];
    for (const guild of guilds) {
      try {
        const health = registry.health(guild.id);
        const iso = health.filter((m) => m.isolated);
        if (iso.length < FEVER_THRESHOLD) continue;
        const last = feverNotified.get(guild.id) || 0;
        if (now - last < FEVER_COOLDOWN_MS) continue;
        feverNotified.set(guild.id, now);
        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`🌡️ FEBBRE: ${iso.length} moduli in protezione`)
          .setDescription(
            `Moduli isolati: ${iso.map((m) => `\`${m.id}\``).join(', ')}\n` +
            'Qualcosa di sistemico non va (permessi? API esterne? riavvio recente?). ' +
            'Controlla `/modulo stato` e i log.'
          )
          .setTimestamp();
        await sendLog(guild, { embeds: [embed] });
        done.push({ guildId: guild.id, fever: iso.length });
      } catch {}
    }
  } catch {}
  return done;
}

function startGuardianJob(client, intervalMs = 2 * 60 * 1000) {
  const t = setTimeout(() => checkOnce(client).catch((e) => console.error('guardian:', e)), 90 * 1000);
  t.unref?.();
  const iv = setInterval(() => checkOnce(client).catch((e) => console.error('guardian:', e)), intervalMs);
  iv.unref?.();
  return iv;
}

module.exports = { startGuardianJob, checkOnce, FEVER_THRESHOLD };
