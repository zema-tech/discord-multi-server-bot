const { Events } = require('discord.js');
const { get, incrementUses, resolveVariables } = require('../database/customCommands');

// Listener separato da messageCreate.js: trigger `!nome` a inizio messaggio.
// I custom commands sono per TUTTI (nessuna esenzione staff qui).
// Cooldown anti-spam: 3s per utente+comando, in memoria con prune.
const cooldowns = new Map();
const COOLDOWN_MS = 3000;

// `!nome` solo a inizio messaggio (dopo eventuali spazi). Slash-like (`/...`) mai.
const TRIGGER_RE = /^!([A-Za-z0-9-]{2,20})(?=\s|$)/;

function pruneCooldowns() {
  if (cooldowns.size <= 5000) return;
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const [k, t] of cooldowns) {
    if (t < cutoff) cooldowns.delete(k);
    if (cooldowns.size <= 4000) break;
  }
}

module.exports = {
  name: Events.MessageCreate,
  // Riesportata per i test: funzione pura (template + contesto semplice, nessun I/O).
  resolveVariables,
  _cooldowns: cooldowns,
  _pruneCooldowns: pruneCooldowns,
  async execute(message, client) {
    // Solo messaggi testuali di utenti nei server: ignora bot e DM.
    if (!message.guild || !message.author || message.author.bot) return;
    if (message.system) return;
    // Controller feature 'customCommands' (default on, mai crashare).
    try {
      if (!require('../modules/registry').isEnabled(message.guild.id, 'customCommands')) return;
    } catch {}

    const content = typeof message.content === 'string' ? message.content : '';
    if (!content) return;

    // Evita loop con aiMention e risposte ad altri bot: skip se menziona il bot.
    try {
      if (client?.user && message.mentions?.has(client.user)) return;
    } catch {
      return;
    }

    const trimmed = content.trimStart();
    // Slash-like o qualunque altro prefisso: non è un custom command.
    if (!trimmed.startsWith('!')) return;

    const m = TRIGGER_RE.exec(trimmed);
    if (!m) return;
    const name = m[1].toLowerCase();

    let entry;
    try {
      entry = get(message.guild.id, name);
    } catch {
      return;
    }
    if (!entry || typeof entry.response !== 'string') return;

    const key = `${message.guild.id}:${message.author.id}:${name}`;
    const now = Date.now();
    if (cooldowns.has(key) && now - cooldowns.get(key) < COOLDOWN_MS) return;
    pruneCooldowns();
    cooldowns.set(key, now);

    let uses = Number(entry.uses) || 0;
    try {
      uses = incrementUses(message.guild.id, name) || uses + 1;
    } catch {}

    const text = resolveVariables(entry.response, {
      userMention: `<@${message.author.id}>`,
      username: message.author.username || 'utente',
      serverName: message.guild.name || 'questo server',
      count: uses,
      channelRef: message.channelId ? `<#${message.channelId}>` : '',
      dateStr: new Date().toLocaleDateString('it-IT'),
      // Testo dopo `!nome`: "!saluta Luca" -> args "Luca" (per {args}).
      args: trimmed.slice(m[0].length).trim().slice(0, 500),
    });

    try {
      await message.reply(text.slice(0, 1500));
    } catch {}
  },
};
