'use strict';
/**
 * src/dashboard/api.js — Router REST della dashboard (stesso processo del bot).
 *
 * NESSUN caricamento di express e NESSUN require dei moduli DB a top-level:
 * tutto avviene dentro createApiRouter() / handler, così questo file resta
 * require-safe anche senza express installato e anche se i moduli di altri
 * agenti (aiConfig, customPerms) non esistono ancora (-> 501, mai crash).
 *
 * Endpoint (richiedono requireAuth montato prima, che mette req.discordToken):
 *   GET  /api/me
 *   GET  /api/guilds
 *   GET  /api/guilds/:gid/meta
 *   GET  /api/guilds/:gid
 *   GET  /api/guilds/:gid/schema
 *   PUT  /api/guilds/:gid/modules/:mod
 *   PUT  /api/guilds/:gid/perms
 */

const MANAGE_GUILD = 0x20;

// Whitelist scritture: modulo -> { chiave: tipo }. Tipi: bool|text|number|channel|role
const MODULE_FIELDS = {
  welcome: { welcomeChannelId: 'channel', welcomeMessage: 'text' },
  automod: { enabled: 'bool', maxMentions: 'number' },
  tickets: { logChannelId: 'channel', maxPerUser: 'number', autoCloseDays: 'number' },
  levels: { levelupEnabled: 'bool' },
  ai: { mentionReply: 'bool', automodAI: 'bool', systemPrompt: 'text' },
  logging: { logChannelId: 'channel' },
  tempvoice: { lobbyChannelId: 'channel', categoryId: 'channel' },
};

function checkType(tipo, v) {
  if (tipo === 'bool') return typeof v === 'boolean';
  if (tipo === 'number') return Number.isFinite(v);
  if (tipo === 'text') return typeof v === 'string';
  if (tipo === 'channel' || tipo === 'role') return v === null || typeof v === 'string';
  return false;
}

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch {
    return null;
  }
}

function hasManageGuild(entry) {
  const perms = typeof entry.permissions === 'string'
    ? BigInt(entry.permissions)
    : BigInt(entry.permissions || 0);
  return (perms & BigInt(MANAGE_GUILD)) !== 0n;
}

/**
 * Converte un icon hash Discord in URL CDN completo (il frontend lo usa in <img>).
 * Ritorna null se assente; lascia invariati i valori già-URL (difensivo).
 */
function iconUrl(id, icon) {
  if (!icon || typeof icon !== 'string') return null;
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}`;
}

function createApiRouter(client) {
  // Lazy: solo qui (mai a top-level) così lo smoke test passa senza express.
  const express = require('express');
  const auth = require('./auth');
  const router = express.Router();

  /** Carica le guild dell'utente + verifica (canManage E botPresent), altrimenti 403. */
  async function loadAccess(req, res, next) {
    try {
      const token = req.discordToken;
      if (!token) return res.status(401).json({ errore: 'Non autenticato.' });
      const gid = req.params.gid;
      let userGuilds;
      try {
        userGuilds = await auth.discordApi(token, '/users/@me/guilds');
      } catch (e) {
        if (e && e.status === 401) {
          return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.' });
        }
        throw e;
      }
      const entry = Array.isArray(userGuilds) ? userGuilds.find((g) => g.id === gid) : null;
      if (!entry || !hasManageGuild(entry)) {
        return res.status(403).json({ errore: 'Serve il permesso Gestisci Server su questa guild.' });
      }
      const guild = client && client.guilds && client.guilds.cache
        ? client.guilds.cache.get(gid) : null;
      if (!guild) {
        return res.status(403).json({ errore: 'Il bot non è presente in questa guild.' });
      }
      req.access = { entry, guild };
      return next();
    } catch (e) {
      console.error('[Dashboard] loadAccess:', e.message);
      return res.status(500).json({ errore: 'Errore interno, riprova.' });
    }
  }

  // ---- GET /api/me -------------------------------------------------------
  router.get('/me', async (req, res) => {
    try {
      const me = await auth.discordApi(req.discordToken, '/users/@me');
      return res.json({
        id: me.id,
        username: me.username,
        avatar: me.avatar,
        avatarUrl: me.avatar && me.id
          ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
          : null,
      });
    } catch (e) {
      if (e && e.status === 401) {
        return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.' });
      }
      console.error('[Dashboard] /api/me:', e.message);
      return res.status(500).json({ errore: 'Impossibile leggere il profilo Discord.' });
    }
  });

  // ---- GET /api/guilds ---------------------------------------------------
  router.get('/guilds', async (req, res) => {
    try {
      const userGuilds = await auth.discordApi(req.discordToken, '/users/@me/guilds');
      const list = (Array.isArray(userGuilds) ? userGuilds : []).map((g) => ({
        id: g.id,
        name: g.name,
        icon: iconUrl(g.id, g.icon),
        botPresent: Boolean(client && client.guilds && client.guilds.cache && client.guilds.cache.has(g.id)),
        canManage: hasManageGuild(g),
      }));
      return res.json(list);
    } catch (e) {
      if (e && e.status === 401) {
        return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.' });
      }
      console.error('[Dashboard] /api/guilds:', e.message);
      return res.status(500).json({ errore: 'Impossibile leggere le guild Discord.' });
    }
  });

  // ---- GET /api/guilds/:gid/meta -----------------------------------------
  router.get('/guilds/:gid/meta', loadAccess, (req, res) => {
    try {
      const guild = req.access.guild;
      const channels = [...guild.channels.cache.values()].map((c) => ({
        id: c.id, name: c.name, type: c.type,
      }));
      const roles = [...guild.roles.cache.values()].map((r) => ({
        id: r.id, name: r.name, color: r.color,
      }));
      return res.json({ channels, roles });
    } catch (e) {
      console.error('[Dashboard] meta:', e.message);
      return res.status(500).json({ errore: 'Impossibile leggere canali/ruoli.' });
    }
  });

  // ---- GET /api/guilds/:gid ----------------------------------------------
  router.get('/guilds/:gid', loadAccess, (req, res) => {
    const gid = req.params.gid;
    const guild = req.access.guild;
    try {
      const guildConfig = safeRequire('../database/guildConfig');
      const tickets = safeRequire('../database/tickets');
      const levels = safeRequire('../database/levels');
      const economy = safeRequire('../database/economy');
      const analytics = safeRequire('../database/analytics');
      const tempvoice = safeRequire('../database/tempvoice');
      const aiConfig = safeRequire('../database/aiConfig');
      const customPerms = safeRequire('../database/customPerms');

      let cfg = {};
      try { cfg = guildConfig ? guildConfig.getGuild(gid) : {}; } catch { cfg = {}; }
      let tcfg = {};
      try { tcfg = tickets ? tickets.getConfig(gid) : {}; } catch { tcfg = {}; }
      let tv = null;
      try { tv = tempvoice ? tempvoice.getConfig(gid) : null; } catch { tv = null; }
      let ai = null;
      try { ai = aiConfig && typeof aiConfig.getConfig === 'function' ? aiConfig.getConfig(gid) : null; } catch { ai = null; }
      let perms = {};
      try {
        if (customPerms) {
          if (typeof customPerms.getAll === 'function') perms = customPerms.getAll(gid);
          else if (typeof customPerms.list === 'function') perms = customPerms.list(gid);
        }
      } catch { perms = {}; }
      let levelTop = [];
      try { levelTop = levels ? levels.getLeaderboard(gid, 5) : []; } catch { levelTop = []; }
      let ecoTop = [];
      try { ecoTop = economy ? economy.getLeaderboard(gid, 5) : []; } catch { ecoTop = []; }
      let analyticsTotals = null;
      try { analyticsTotals = analytics ? analytics.totals(gid, 7) : null; } catch { analyticsTotals = null; }
      let ticketStats = null;
      try { ticketStats = tickets ? tickets.getStats(gid) : null; } catch { ticketStats = null; }

      return res.json({
        guild: {
          id: guild.id,
          name: guild.name,
          icon: iconUrl(guild.id, guild.icon),
          memberCount: guild.memberCount ?? null,
        },
        modules: {
          welcome: { welcomeChannelId: cfg.welcomeChannelId ?? null, welcomeMessage: cfg.welcomeMessage ?? null },
          automod: cfg.automod || { enabled: false, maxMentions: 5 },
          tickets: tcfg,
          levels: { levelupEnabled: cfg.levelupEnabled ?? true },
          ai,
          logging: { logChannelId: cfg.logChannelId ?? null },
          tempvoice: tv,
        },
        perms,
        stats: {
          levels: levelTop,
          economy: ecoTop,
          analytics: analyticsTotals,
          tickets: ticketStats,
        },
      });
    } catch (e) {
      console.error('[Dashboard] guild detail:', e.message);
      return res.status(500).json({ errore: 'Impossibile leggere la configurazione.' });
    }
  });

  // ---- GET /api/guilds/:gid/schema ---------------------------------------
  router.get('/guilds/:gid/schema', loadAccess, (req, res) => {
    return res.json([
      {
        module: 'welcome',
        title: 'Benvenuto',
        fields: [
          { key: 'welcomeChannelId', label: 'Canale benvenuto', type: 'channel' },
          { key: 'welcomeMessage', label: 'Messaggio benvenuto', type: 'text' },
        ],
      },
      {
        module: 'automod',
        title: 'Automod',
        fields: [
          { key: 'enabled', label: 'Abilitato', type: 'bool' },
          { key: 'maxMentions', label: 'Max menzioni', type: 'number' },
        ],
      },
      {
        module: 'tickets',
        title: 'Ticket',
        fields: [
          { key: 'logChannelId', label: 'Canale log', type: 'channel' },
          { key: 'maxPerUser', label: 'Max per utente', type: 'number' },
          { key: 'autoCloseDays', label: 'Giorni auto-chiusura', type: 'number' },
        ],
      },
      {
        module: 'levels',
        title: 'Livelli',
        fields: [
          { key: 'levelupEnabled', label: 'Messaggi level-up', type: 'bool' },
        ],
      },
      {
        module: 'ai',
        title: 'AI',
        fields: [
          { key: 'mentionReply', label: 'Risposta alle menzioni', type: 'bool' },
          { key: 'automodAI', label: 'Automod AI', type: 'bool' },
          { key: 'systemPrompt', label: 'Prompt di sistema', type: 'text' },
        ],
      },
      {
        module: 'logging',
        title: 'Log',
        fields: [
          { key: 'logChannelId', label: 'Canale log', type: 'channel' },
        ],
      },
      {
        module: 'tempvoice',
        title: 'Vocali temporanee',
        fields: [
          { key: 'lobbyChannelId', label: 'Canale lobby', type: 'channel' },
          { key: 'categoryId', label: 'Categoria', type: 'channel' },
        ],
      },
    ]);
  });

  // ---- PUT /api/guilds/:gid/modules/:mod ---------------------------------
  // Hardening: range numerici, cap testi, canali verificati nella guild.
  // (Senza questi, maxMentions negativo flaggherebbe OGNI messaggio e ID
  //  spazzatura romperebbero le feature in silenzio.)
  router.put('/guilds/:gid/modules/:mod', loadAccess, async (req, res) => {
    const gid = req.params.gid;
    const mod = req.params.mod;
    const guild = req.access.guild;
    try {
      const spec = MODULE_FIELDS[mod];
      if (!spec) return res.status(400).json({ errore: `Modulo sconosciuto: ${mod}.` });
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const keys = Object.keys(body);
      if (keys.length === 0) return res.status(400).json({ errore: 'Body vuoto: niente da salvare.' });
      for (const k of keys) {
        if (!spec[k]) return res.status(400).json({ errore: `Chiave non valida per ${mod}: ${k}.` });
        if (!checkType(spec[k], body[k])) {
          return res.status(400).json({ errore: `Tipo non valido per ${k}: atteso ${spec[k]}.` });
        }
      }
      const NUMBER_RANGES = { maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90] };
      const TEXT_LIMITS = { welcomeMessage: 500, systemPrompt: 1000 };
      const patch = {};
      for (const k of keys) {
        let v = body[k];
        if (spec[k] === 'number') {
          v = Math.floor(v);
          const range = NUMBER_RANGES[k];
          if (range && (v < range[0] || v > range[1])) {
            return res.status(400).json({ errore: `${k} deve stare tra ${range[0]} e ${range[1]}.` });
          }
        } else if (spec[k] === 'text' && typeof v === 'string') {
          v = v.slice(0, TEXT_LIMITS[k] || 1000);
        } else if (spec[k] === 'channel' && v !== null) {
          if (typeof v !== 'string' || !/^\d{10,25}$/.test(v)) {
            return res.status(400).json({ errore: `Canale non valido per ${k}.` });
          }
          let ch = guild.channels.cache.get(v);
          if (!ch) ch = await guild.channels.fetch(v).catch(() => null);
          if (!ch) {
            return res.status(400).json({ errore: `Canale non trovato in questo server per ${k}.` });
          }
        }
        patch[k] = v;
      }

      const guildConfig = safeRequire('../database/guildConfig');
      const tickets = safeRequire('../database/tickets');
      const tempvoice = safeRequire('../database/tempvoice');
      const aiConfig = safeRequire('../database/aiConfig');
      let updated;

      switch (mod) {
        case 'welcome':
        case 'logging':
          if (!guildConfig) return res.status(500).json({ errore: 'Modulo guildConfig non disponibile.' });
          updated = guildConfig.updateGuild(gid, patch);
          break;
        case 'automod':
          if (!guildConfig) return res.status(500).json({ errore: 'Modulo guildConfig non disponibile.' });
          updated = guildConfig.updateGuild(gid, { automod: patch });
          break;
        case 'levels':
          if (!guildConfig) return res.status(500).json({ errore: 'Modulo guildConfig non disponibile.' });
          updated = guildConfig.updateGuild(gid, patch);
          break;
        case 'tickets':
          if (!tickets) return res.status(500).json({ errore: 'Modulo tickets non disponibile.' });
          updated = tickets.setConfig(gid, patch);
          break;
        case 'tempvoice':
          if (!tempvoice) return res.status(501).json({ errore: 'Modulo tempvoice non ancora disponibile.' });
          updated = tempvoice.setConfig(gid, patch);
          break;
        case 'ai':
          if (!aiConfig) return res.status(501).json({ errore: 'Modulo AI non ancora disponibile.' });
          if (typeof aiConfig.setConfig === 'function') updated = aiConfig.setConfig(gid, patch);
          else if (typeof aiConfig.updateConfig === 'function') updated = aiConfig.updateConfig(gid, patch);
          else return res.status(501).json({ errore: 'Modulo AI senza API di scrittura.' });
          break;
        default:
          return res.status(400).json({ errore: `Modulo sconosciuto: ${mod}.` });
      }
      return res.json({ ok: true, module: mod, config: updated });
    } catch (e) {
      console.error('[Dashboard] PUT module:', e.message);
      return res.status(500).json({ errore: 'Salvataggio fallito, riprova.' });
    }
  });

  // ---- PUT /api/guilds/:gid/perms ----------------------------------------
  router.put('/guilds/:gid/perms', loadAccess, (req, res) => {
    const gid = req.params.gid;
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { command, roleIds } = body;
      if (!command || typeof command !== 'string') {
        return res.status(400).json({ errore: 'Campo command mancante o non valido.' });
      }
      if (!Array.isArray(roleIds) || !roleIds.every((r) => typeof r === 'string')) {
        return res.status(400).json({ errore: 'Campo roleIds mancante: array di stringhe.' });
      }
      const customPerms = safeRequire('../database/customPerms');
      if (!customPerms) {
        return res.status(501).json({ errore: 'Modulo permessi non ancora disponibile.' });
      }
      // roleIds:[] = reset del comando (setCommandRoles lancia su array vuoto -> 500).
      if (roleIds.length === 0) {
        if (typeof customPerms.clearCommandRoles === 'function') customPerms.clearCommandRoles(gid, command);
        else if (typeof customPerms.clear === 'function') customPerms.clear(gid, command);
        else if (typeof customPerms.remove === 'function') customPerms.remove(gid, command);
        else if (typeof customPerms.clearAll === 'function') {
          // Fallback senza API per-comando: niente da cancellare in modo mirato,
          // il comando resta comunque senza ruoli (hasCustom -> false).
        } else {
          return res.status(501).json({ errore: 'Modulo permessi senza API di cancellazione.' });
        }
        return res.json({ ok: true, command, perms: [], cleared: true });
      }
      let result;
      if (typeof customPerms.setCommandRoles === 'function') result = customPerms.setCommandRoles(gid, command, roleIds);
      else if (typeof customPerms.setCommandPerms === 'function') result = customPerms.setCommandPerms(gid, command, roleIds);
      else if (typeof customPerms.setPerms === 'function') result = customPerms.setPerms(gid, command, roleIds);
      else if (typeof customPerms.setCommand === 'function') result = customPerms.setCommand(gid, command, roleIds);
      else if (typeof customPerms.updatePerms === 'function') result = customPerms.updatePerms(gid, command, roleIds);
      else return res.status(501).json({ errore: 'Modulo permessi senza API di scrittura.' });
      return res.json({ ok: true, command, perms: result });
    } catch (e) {
      console.error('[Dashboard] PUT perms:', e.message);
      return res.status(500).json({ errore: 'Salvataggio permessi fallito, riprova.' });
    }
  });

  return router;
}

module.exports = { createApiRouter, MODULE_FIELDS };
