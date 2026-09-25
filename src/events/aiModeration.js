const { Events } = require('discord.js');
const { getGuild } = require('../database/guildConfig');
const { addWarn, getWarnings } = require('../database/warnings');
const { askAI } = require('../ai/ai');

// aiConfig potrebbe non esistere ancora: require-safe con default { automodAI: false }.
let aiConfigMod = null;
try {
  aiConfigMod = require('../database/aiConfig');
} catch {
  aiConfigMod = null;
}

function isAutomodAIEnabled(guildId) {
  try {
    if (!aiConfigMod) return false;
    // Supporta sia accessor per-guild sia oggetto piatto { automodAI }.
    if (typeof aiConfigMod.getAIConfig === 'function') {
      const c = aiConfigMod.getAIConfig(guildId);
      return !!(c && c.automodAI === true);
    }
    if (typeof aiConfigMod.getAiConfig === 'function') {
      const c = aiConfigMod.getAiConfig(guildId);
      return !!(c && c.automodAI === true);
    }
    if (typeof aiConfigMod.getConfig === 'function') {
      const c = aiConfigMod.getConfig(guildId);
      return !!(c && c.automodAI === true);
    }
    if (typeof aiConfigMod.automodAI === 'boolean') return aiConfigMod.automodAI === true;
    if (aiConfigMod.default && typeof aiConfigMod.default.automodAI === 'boolean') {
      return aiConfigMod.default.automodAI === true;
    }
    return false;
  } catch {
    return false;
  }
}

// Per-utente cooldown 60s in memoria (con prune). Chiave: guildId:userId -> timestamp.
const userCooldown = new Map();
const USER_COOLDOWN_MS = 60 * 1000;

// Rate-limit globale: max 1 chiamata AI ogni 3s per guild. guildId -> timestamp ultimo invio.
const guildLastAI = new Map();
const GUILD_AI_MIN_GAP_MS = 3 * 1000;

function pruneMap(map, maxSize, maxAgeMs) {
  try {
    if (map.size <= maxSize) return;
    const cutoff = Date.now() - maxAgeMs;
    for (const [k, t] of map) {
      if (t < cutoff) map.delete(k);
      if (map.size <= maxSize) break;
    }
  } catch {}
}

/**
 * Parsing tollerante del verdict AI. Cerca il primo blocco {..} e fa fallback a ok.
 * @param {string} text - Risposta grezza dell'AI.
 * @returns {{ verdict: 'ok'|'warn'|'delete', reason: string }}
 */
function parseVerdict(text) {
  const fallback = { verdict: 'ok', reason: '' };
  if (!text || typeof text !== 'string') return fallback;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return fallback;
  const candidate = text.slice(start, end + 1);
  // Prova prima il blocco più ampio, poi i blocchi singoli non-greedy.
  const attempts = [candidate, ...(candidate.match(/\{[^{}]*\}/g) || [])];
  for (const a of attempts) {
    try {
      const o = JSON.parse(a);
      if (!o || typeof o !== 'object') continue;
      const v = String(o.verdict || '').toLowerCase().trim();
      if (v === 'ok' || v === 'warn' || v === 'delete') {
        return { verdict: v, reason: String(o.reason || '').slice(0, 300) };
      }
    } catch {}
  }
  return fallback;
}

function buildPrompt(content) {
  return (
    'Sei un moderatore di un server Discord italiano. Classifica il messaggio seguente.\n' +
    'Rispondi SOLO con JSON valido, senza testo extra: {"verdict":"ok|warn|delete","reason":"..."}\n' +
    '- "ok": messaggio normale, ironico o innocuo.\n' +
    '- "warn": fastidioso, borderline, linguaggio volgare lieve, provocazione.\n' +
    '- "delete": hate speech, minacce, molestie, spam grave, contenuti sessuali espliciti, istigazione a violare la legge.\n' +
    'La "reason" deve essere una breve spiegazione in italiano.\n' +
    `Messaggio: """${String(content).slice(0, 1000)}"""`
  );
}

module.exports = {
  name: Events.MessageCreate,
  parseVerdict,
  // Esposti per test/debug senza toccare la rete.
  _maps: { userCooldown, guildLastAI },
  _isAutomodAIEnabled: isAutomodAIEnabled,
  async execute(message, client) {
    try {
      if (!message || !message.guild || !message.author) return;
      if (message.author.bot) return;
      // Controller feature 'ai' (default on, mai crashare).
      try {
        if (!require('../modules/commander').canRun(message.guild.id, 'ai').ok) return;
      } catch {}
      const content = message.content || '';
      if (content.length < 20) return;
      // Member null (permessi sconosciuti) = esente: mai punire senza verifica staff.
      if (!message.member || message.member.permissions.has('ManageMessages')) return;

      // Solo lettura guildConfig: serve automod.enabled.
      let automodOn = false;
      try {
        automodOn = !!getGuild(message.guild.id)?.automod?.enabled;
      } catch {
        return;
      }
      if (!automodOn) return;
      if (!isAutomodAIEnabled(message.guild.id)) return;

      const now = Date.now();
      const userKey = `${message.guild.id}:${message.author.id}`;

      pruneMap(userCooldown, 5000, USER_COOLDOWN_MS);
      pruneMap(guildLastAI, 1000, GUILD_AI_MIN_GAP_MS);
      if (userCooldown.has(userKey) && now - userCooldown.get(userKey) < USER_COOLDOWN_MS) return;
      if (guildLastAI.has(message.guild.id) && now - guildLastAI.get(message.guild.id) < GUILD_AI_MIN_GAP_MS) return;

      // UNA sola chiamata AI per messaggio.
      let raw;
      try {
        userCooldown.set(userKey, now);
        guildLastAI.set(message.guild.id, now);
        raw = await askAI(buildPrompt(content));
      } catch {
        // In errore AI -> ignora silenziosamente (l'automod keyword resta la rete primaria).
        return;
      }

      const { verdict, reason } = parseVerdict(raw);
      if (verdict === 'ok') return;

      try {
        await message.delete().catch(() => {});
      } catch {}
      const safeReason = reason ? reason.slice(0, 200) : 'contenuto segnalato dall\u2019AI';
      let warn = null;
      try {
        warn = addWarn(message.guild.id, message.author.id, {
          modId: client?.user?.id,
          reason: `AI: ${safeReason}`,
        });
      } catch {}
      let total = 0;
      try {
        total = getWarnings(message.guild.id, message.author.id).length;
      } catch {}

      const label = verdict === 'delete' ? 'rimosso' : 'segnalato';
      const warnInfo = warn ? ` Warn #${total} (ID \`${warn.id}\`).` : '';
      const reply = await message.channel
        .send(`⚠️ ${message.author}, messaggio ${label} (motivo: ${safeReason}).${warnInfo}`)
        .catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 8000).unref?.();

      // Timeout 10m solo se verdict delete E utente già con 2+ warn totali (=> totale >= 3 dopo questa).
      try {
        if (verdict === 'delete' && total >= 3 && message.member?.moderatable) {
          await message.member.timeout(10 * 60 * 1000, `AI moderazione: ${safeReason}`).catch(() => {});
        }
      } catch {}
    } catch {}
  },
};
