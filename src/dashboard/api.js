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
 *
 * I moduli "lista" (autoresponder, commands, rewards) viaggiano sullo STESSO
 * pattern PUT modules/:mod con un body { action, ... }: nessun endpoint extra,
 * così il contratto FE<->BE resta invariato.
 */

const MANAGE_GUILD = 0x20;

// Whitelist scritture: modulo -> { chiave: tipo }.
// Tipi: bool|text|number|channel|role|roles|lang|emoji
const MODULE_FIELDS = {
  general: {
    language: 'lang',
    logChannelId: 'channel',
    suggestChannelId: 'channel',
    levelupChannelId: 'channel',
    levelupEnabled: 'bool',
  },
  welcome: {
    welcomeChannelId: 'channel',
    welcomeMessage: 'text',
    goodbyeChannelId: 'channel',
    goodbyeMessage: 'text',
  },
  automod: {
    enabled: 'bool',
    antiSpam: 'bool',
    antiLink: 'bool',
    antiInvite: 'bool',
    maxMentions: 'number',
    maxCapsPercent: 'number',
    badWords: 'text',
  },
  autorole: { enabled: 'bool', delaySeconds: 'number', roleIds: 'roles' },
  starboard: { channelId: 'channel', threshold: 'number', emoji: 'emoji' },
  confessioni: { channelId: 'channel' },
  levels: { levelupEnabled: 'bool', levelupChannelId: 'channel' },
  tickets: { logChannelId: 'channel', maxPerUser: 'number', autoCloseDays: 'number' },
  tempvoice: { lobbyChannelId: 'channel', categoryId: 'channel' },
  ai: { mentionReply: 'bool', automodAI: 'bool', ticketAI: 'bool', funAI: 'bool', systemPrompt: 'text' },
  logging: { logChannelId: 'channel' },
  // Moduli "lista": validati ad-hoc nel PUT (action-based), mai con checkType.
  autoresponder: {},
  commands: {},
  rewards: {},
};

function checkType(tipo, v) {
  if (tipo === 'bool') return typeof v === 'boolean';
  if (tipo === 'number') return Number.isFinite(v);
  if (tipo === 'text') return typeof v === 'string';
  if (tipo === 'channel' || tipo === 'role') return v === null || typeof v === 'string';
  if (tipo === 'lang') return v === 'it' || v === 'en';
  if (tipo === 'emoji') return typeof v === 'string' && v.length >= 1 && v.length <= 50;
  if (tipo === 'roles') {
    return Array.isArray(v) && v.length <= 25 && v.every((r) => typeof r === 'string');
  }
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
  try {
    if (!entry || typeof entry !== 'object') return false;
    const p = entry.permissions;
    if (p === undefined || p === null) return false;
    let perms;
    if (typeof p === 'bigint') {
      perms = p;
    } else if (typeof p === 'number') {
      if (!Number.isFinite(p)) return false;
      perms = BigInt(Math.floor(p));
    } else if (typeof p === 'string') {
      const s = p.trim();
      if (!/^\d+$/.test(s)) return false;
      perms = BigInt(s);
    } else {
      return false;
    }
    return (perms & BigInt(MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

/** Clona e converte eventuali BigInt in String (JSON.stringify lancia sui BigInt -> 500). */
function sanitizeForJson(value, seen) {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  const active = seen || new WeakSet();
  if (active.has(value)) return null;
  active.add(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeForJson(v, active));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    try {
      out[k] = sanitizeForJson(v, active);
    } catch {
      out[k] = null;
    }
  }
  return out;
}

/** Log server-side utile senza mai loggare token/cookie/PII. */
function logDashboardError(route, e) {
  try {
    const msg = e && e.message ? e.message : String(e);
    const st = e && e.status !== undefined && e.status !== null ? e.status : 'n/a';
    console.error(`[Dashboard] ${route}: ${msg} | status=${st}`);
  } catch {
    try { console.error('[Dashboard] log-failed | status=n/a'); } catch { /* mai rompere */ }
  }
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

function isSnowflake(v) {
  return typeof v === 'string' && /^\d{10,25}$/.test(v);
}

function inviteUrl(clientId, guildId) {
  if (!clientId || !guildId) return null;
  const perms = '8';
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&permissions=${perms}&scope=bot%20applications.commands&guild_id=${encodeURIComponent(guildId)}`;
}

function createApiRouter(client) {
  // Lazy: solo qui (mai a top-level) così lo smoke test passa senza express.
  const express = require('express');
  const auth = require('./auth');
  const router = express.Router();

  /**
   * Wrapper locale con retry UNA volta solo su errori di rete senza status HTTP
   * (timeout, ECONNRESET, fetch fallita). Mai su errori HTTP (401/403/429/...).
   */
  async function apiWithRetry(token, apiPath) {
    try {
      return await auth.discordApi(token, apiPath);
    } catch (e) {
      if (e && (e.status === undefined || e.status === null)) {
        return await auth.discordApi(token, apiPath);
      }
      throw e;
    }
  }

  /** Carica le guild dell'utente + verifica (canManage E botPresent), altrimenti 403. */
  async function loadAccess(req, res, next) {
    try {
      const token = req.discordToken;
      if (!token) return res.status(401).json({ errore: 'Non autenticato.' });
      const gid = req.params.gid;
      let userGuilds;
      try {
        userGuilds = await apiWithRetry(token, '/users/@me/guilds');
      } catch (e) {
        if (e && e.status === 401) {
          return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.', relogin: true });
        }
        if (e && e.status === 403) {
          return res.status(401).json({ errore: 'Scope Discord mancante (guilds): riaccedi effettuando di nuovo il login.', relogin: true });
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
      logDashboardError('loadAccess', e);
      return res.status(500).json({ errore: 'Errore interno, riprova.' });
    }
  }

  async function resolveChannel(guild, id) {
    if (id === null) return null;
    if (!isSnowflake(id)) return { invalid: true };
    let ch = guild.channels.cache.get(id);
    if (!ch) ch = await guild.channels.fetch(id).catch(() => null);
    if (!ch) return { missing: true };
    return { channel: ch };
  }

  function resolveRoles(guild, ids) {
    const out = [];
    for (const id of ids) {
      if (!isSnowflake(id)) return { invalid: id };
      const role = guild.roles.cache.get(id);
      if (!role) return { missing: id };
      if (role.managed) return { managed: id };
      out.push(id);
    }
    return { roles: out };
  }

  // ---- GET /api/me -------------------------------------------------------
  router.get('/me', async (req, res) => {
    try {
      const me = await apiWithRetry(req.discordToken, '/users/@me');
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
        return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.', relogin: true });
      }
      if (e && e.status === 403) {
        return res.status(401).json({ errore: 'Scope Discord mancante: riaccedi effettuando di nuovo il login.', relogin: true });
      }
      logDashboardError('/api/me', e);
      return res.status(500).json({ errore: 'Impossibile leggere il profilo Discord.' });
    }
  });

  // ---- GET /api/guilds ---------------------------------------------------
  // Arricchita: per i server dove il bot è dentro aggiunge memberCount +
  // icona dalla cache; per quelli gestibili SENZA bot aggiunge inviteUrl.
  router.get('/guilds', async (req, res) => {
    try {
      const userGuilds = await apiWithRetry(req.discordToken, '/users/@me/guilds');
      const clientId = process.env.CLIENT_ID || '';
      const list = (Array.isArray(userGuilds) ? userGuilds : []).map((g) => {
        const botGuild = client && client.guilds && client.guilds.cache
          ? client.guilds.cache.get(g.id) : null;
        const botPresent = Boolean(botGuild);
        const canManage = hasManageGuild(g);
        let memberCount = null;
        let icon = iconUrl(g.id, g.icon);
        if (botGuild) {
          try {
            if (typeof botGuild.memberCount === 'number') memberCount = botGuild.memberCount;
            if (botGuild.icon) icon = iconUrl(botGuild.id, botGuild.icon) || icon;
          } catch { /* cache parziale: resta il dato OAuth */ }
        }
        return {
          id: g.id,
          name: g.name,
          icon,
          botPresent,
          canManage,
          memberCount,
          inviteUrl: (!botPresent && canManage) ? inviteUrl(clientId, g.id) : null,
        };
      });
      // Prima i server con il bot, poi gli altri; alfabetici a parità.
      list.sort((a, b) => Number(b.botPresent) - Number(a.botPresent) || String(a.name).localeCompare(String(b.name)));
      return res.json(sanitizeForJson(list));
    } catch (e) {
      if (e && e.status === 401) {
        return res.status(401).json({ errore: 'Sessione Discord scaduta: rieffettua il login.', relogin: true });
      }
      if (e && e.status === 403) {
        return res.status(401).json({ errore: 'Scope Discord mancante (guilds): riaccedi effettuando di nuovo il login.', relogin: true });
      }
      logDashboardError('/api/guilds', e);
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
      const roles = [...guild.roles.cache.values()]
        .filter((r) => r.id !== guild.id)
        .map((r) => ({
          id: r.id, name: r.name, color: r.color, managed: Boolean(r.managed),
        }));
      roles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return res.json(sanitizeForJson({ channels, roles }));
    } catch (e) {
      logDashboardError('meta', e);
      return res.status(500).json({ errore: 'Impossibile leggere canali/ruoli.' });
    }
  });

  // ---- GET /api/guilds/:gid/diag (backend-only, mai chiamata dal frontend) --
  // Dietro requireAuth+loadAccess: ritorna step-by-step per capire i 500.
  router.get('/guilds/:gid/diag', loadAccess, (req, res) => {
    try {
      const gid = req.params.gid;
      const entry = req.access && req.access.entry;
      const guild = req.access && req.access.guild;
      let canManage = false;
      try { canManage = hasManageGuild(entry); } catch { canManage = false; }
      const dbModules = {
        guildConfig: '../database/guildConfig',
        tickets: '../database/tickets',
        levels: '../database/levels',
        economy: '../database/economy',
        analytics: '../database/analytics',
        tempvoice: '../database/tempvoice',
        aiConfig: '../database/aiConfig',
        customPerms: '../database/customPerms',
        autorole: '../database/autorole',
        starboard: '../database/starboard',
        confessioni: '../database/confessioni',
        autoresponder: '../database/autoresponder',
        customCommands: '../database/customCommands',
        levelRewards: '../database/levelRewards',
      };
      const dbOk = {};
      for (const [name, rel] of Object.entries(dbModules)) {
        try {
          dbOk[name] = Boolean(safeRequire(rel));
        } catch {
          dbOk[name] = false;
        }
      }
      try {
        const xm = safeRequire('./modules-extra');
        dbOk['modules-extra'] = Boolean(xm);
      } catch {
        dbOk['modules-extra'] = false;
      }
      let counts = {};
      try {
        counts = {
          members: guild.memberCount ?? null,
          channels: guild.channels.cache.size,
          roles: Math.max(guild.roles.cache.size - 1, 0),
        };
      } catch {
        counts = {};
      }
      return res.json(sanitizeForJson({
        gid,
        tokenOk: Boolean(req.discordToken),
        guildsOk: Boolean(entry),
        botPresent: Boolean(guild),
        canManage,
        dbOk,
        counts,
      }));
    } catch (e) {
      logDashboardError('/api/guilds/:gid/diag', e);
      return res.status(500).json({ errore: 'Diagnostica fallita, riprova.' });
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
      const autorole = safeRequire('../database/autorole');
      const starboard = safeRequire('../database/starboard');
      const confessioni = safeRequire('../database/confessioni');
      const autoresponder = safeRequire('../database/autoresponder');
      const customCommands = safeRequire('../database/customCommands');
      const levelRewards = safeRequire('../database/levelRewards');

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
      let trends = [];
      try { trends = analytics && typeof analytics.getDays === 'function' ? analytics.getDays(gid, 30) : []; } catch { trends = []; }
      let ticketStats = null;
      try { ticketStats = tickets ? tickets.getStats(gid) : null; } catch { ticketStats = null; }
      let openTickets = 0;
      try {
        if (tickets && typeof tickets.openTickets === 'function') {
          const open = tickets.openTickets(gid);
          openTickets = Array.isArray(open) ? open.length
            : (typeof open === 'number' ? open : 0);
        } else if (tickets && typeof tickets.getOpenTickets === 'function') {
          const open = tickets.getOpenTickets(gid);
          openTickets = Array.isArray(open) ? open.length : 0;
        } else if (ticketStats && typeof ticketStats.open === 'number') {
          openTickets = ticketStats.open;
        }
      } catch { openTickets = 0; }

      let arCfg = null;
      try { arCfg = autorole ? autorole.getConfig(gid) : null; } catch { arCfg = null; }
      let sbCfg = null;
      try { sbCfg = starboard ? starboard.getStarboard(gid) : null; } catch { sbCfg = null; }
      let cfCfg = null;
      try { cfCfg = confessioni ? confessioni.getConfessioni(gid) : null; } catch { cfCfg = null; }
      let arList = [];
      try { arList = autoresponder ? autoresponder.listTriggers(gid) : []; } catch { arList = []; }
      let ccList = [];
      try { ccList = customCommands ? customCommands.list(gid) : []; } catch { ccList = []; }
      let rwList = [];
      try { rwList = levelRewards ? levelRewards.listRewards(gid) : []; } catch { rwList = []; }

      const automod = cfg.automod || {};
      const badWordsArr = Array.isArray(automod.badWords) ? automod.badWords : [];

      const modules = {
        general: {
          language: cfg.language ?? 'it',
          logChannelId: cfg.logChannelId ?? null,
          suggestChannelId: cfg.suggestChannelId ?? null,
          levelupChannelId: cfg.levelupChannelId ?? null,
          levelupEnabled: cfg.levelupEnabled ?? true,
        },
        welcome: {
          welcomeChannelId: cfg.welcomeChannelId ?? null,
          welcomeMessage: cfg.welcomeMessage ?? null,
          goodbyeChannelId: cfg.goodbyeChannelId ?? null,
          goodbyeMessage: cfg.goodbyeMessage ?? null,
        },
        automod: {
          enabled: automod.enabled ?? false,
          antiSpam: automod.antiSpam ?? true,
          antiLink: automod.antiLink ?? true,
          antiInvite: automod.antiInvite ?? true,
          maxMentions: automod.maxMentions ?? 5,
          maxCapsPercent: automod.maxCapsPercent ?? 80,
          badWords: badWordsArr.join(', '),
        },
        autorole: arCfg || { enabled: true, roleIds: [], delaySeconds: 0 },
        starboard: sbCfg
          ? { channelId: sbCfg.channelId ?? null, threshold: sbCfg.threshold ?? 3, emoji: sbCfg.emoji ?? '⭐' }
          : { channelId: null, threshold: 3, emoji: '⭐' },
        confessioni: cfCfg || { channelId: null },
        levels: {
          levelupEnabled: cfg.levelupEnabled ?? true,
          levelupChannelId: cfg.levelupChannelId ?? null,
        },
        tickets: tcfg,
        tempvoice: tv,
        ai,
        logging: { logChannelId: cfg.logChannelId ?? null },
      };
      const lists = {
        autoresponder: Array.isArray(arList) ? arList.slice(0, 50) : [],
        customCommands: Array.isArray(ccList) ? ccList.slice(0, 20) : [],
        levelRewards: Array.isArray(rwList) ? rwList : [],
      };
      // Hook moduli extra (require-safe: se il file manca, comportamento identico a oggi).
      try {
        const xm = safeRequire('./modules-extra');
        if (xm && typeof xm.readExtra === 'function') {
          const extraData = xm.readExtra(gid);
          if (extraData && typeof extraData === 'object') {
            const { listsExtra, ...extraModules } = extraData;
            Object.assign(modules, extraModules);
            if (listsExtra && typeof listsExtra === 'object') Object.assign(lists, listsExtra);
          }
        }
      } catch { /* extra opzionale: mai 500 per questo */ }

      return res.json(sanitizeForJson({
        guild: {
          id: guild.id,
          name: guild.name,
          icon: iconUrl(guild.id, guild.icon),
          memberCount: guild.memberCount ?? null,
        },
        counts: {
          members: guild.memberCount ?? null,
          channels: guild.channels.cache.size,
          roles: Math.max(guild.roles.cache.size - 1, 0),
          commands: (client && typeof client.commands?.size === 'number') ? client.commands.size : 0,
        },
        modules,
        lists,
        perms,
        stats: {
          levels: levelTop,
          economy: ecoTop,
          analytics: analyticsTotals,
          trends: Array.isArray(trends) ? trends : [],
          tickets: ticketStats,
          openTickets,
        },
      }));
    } catch (e) {
      logDashboardError('guild detail', e);
      return res.status(500).json({ errore: 'Impossibile leggere la configurazione.' });
    }
  });

  // ---- GET /api/guilds/:gid/schema ---------------------------------------
  // Shape invariato [{ module, title, fields[] }] + metadati opzionali
  // (section, description, icon, placeholder, help, options, multiline)
  // che il frontend usa per tab e controlli ricchi. Vecchi client ignorano i nuovi campi.
  router.get('/guilds/:gid/schema', loadAccess, (req, res) => {
    try {
      const baseSchema = [
      {
        module: 'general', title: 'Generale', icon: '⚙️', section: 'Generale',
        description: 'Lingua, log, suggerimenti e annunci level-up.',
        fields: [
          { key: 'language', label: 'Lingua del bot', type: 'lang', options: [{ value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }] },
          { key: 'logChannelId', label: 'Canale log moderazione', type: 'channel' },
          { key: 'suggestChannelId', label: 'Canale suggerimenti', type: 'channel' },
          { key: 'levelupChannelId', label: 'Canale annunci level-up (vuoto = stesso canale)', type: 'channel' },
          { key: 'levelupEnabled', label: 'Annunci level-up', type: 'bool' },
        ],
      },
      {
        module: 'welcome', title: 'Benvenuto & Addii', icon: '👋', section: 'Generale',
        description: 'Messaggi di benvenuto e di uscita. Variabili: {user} {server} {count}.',
        fields: [
          { key: 'welcomeChannelId', label: 'Canale benvenuto', type: 'channel' },
          { key: 'welcomeMessage', label: 'Messaggio benvenuto', type: 'text', multiline: true, placeholder: '👋 Benvenuto {user} su {server}! Ora siamo {count} membri.' },
          { key: 'goodbyeChannelId', label: 'Canale addii', type: 'channel' },
          { key: 'goodbyeMessage', label: 'Messaggio addio', type: 'text', multiline: true, placeholder: '👋 {user} ha lasciato {server}.' },
        ],
      },
      {
        module: 'automod', title: 'Automod', icon: '🛡️', section: 'Moderazione',
        description: 'Filtri automatici anti-spam, link, inviti e caps.',
        fields: [
          { key: 'enabled', label: 'Abilitato', type: 'bool' },
          { key: 'antiSpam', label: 'Anti-spam', type: 'bool' },
          { key: 'antiLink', label: 'Anti-link', type: 'bool' },
          { key: 'antiInvite', label: 'Anti-inviti Discord', type: 'bool' },
          { key: 'maxMentions', label: 'Max menzioni per messaggio', type: 'number' },
          { key: 'maxCapsPercent', label: 'Max % MAIUSCOLE', type: 'number' },
          { key: 'badWords', label: 'Parole vietate (separate da virgola)', type: 'text', multiline: true, placeholder: 'spam, truffa, ...' },
        ],
      },
      {
        module: 'autorole', title: 'Autorole', icon: '🎭', section: 'Moderazione',
        description: 'Ruoli assegnati in automatico ai nuovi membri.',
        fields: [
          { key: 'enabled', label: 'Abilitato', type: 'bool' },
          { key: 'delaySeconds', label: 'Ritardo assegnazione (secondi)', type: 'number' },
          { key: 'roleIds', label: 'Ruoli automatici', type: 'roles', help: 'Seleziona uno o più ruoli (esclusi i bot).' },
        ],
      },
      {
        module: 'levels', title: 'Livelli XP', icon: '⭐', section: 'Livelli',
        description: 'XP da messaggi e vocali + ricompense per livello (gestite sotto).',
        fields: [
          { key: 'levelupEnabled', label: 'Messaggi level-up', type: 'bool' },
          { key: 'levelupChannelId', label: 'Canale annunci level-up', type: 'channel' },
        ],
      },
      {
        module: 'rewards', title: 'Ricompense livello', icon: '🏅', section: 'Livelli',
        description: 'Assegna un ruolo al raggiungimento di un livello. Usa il pannello dedicato sotto.',
        fields: [],
        custom: 'rewards',
      },
      {
        module: 'tickets', title: 'Ticket', icon: '🎫', section: 'Ticket & Vocali',
        description: 'Supporto organizzato con auto-chiusura per inattività.',
        fields: [
          { key: 'logChannelId', label: 'Canale log ticket', type: 'channel' },
          { key: 'maxPerUser', label: 'Max ticket aperti per utente', type: 'number' },
          { key: 'autoCloseDays', label: 'Giorni auto-chiusura (0 = off)', type: 'number' },
        ],
      },
      {
        module: 'tempvoice', title: 'Vocali temporanee', icon: '🔊', section: 'Ticket & Vocali',
        description: 'Crea vocali private dalla lobby.',
        fields: [
          { key: 'lobbyChannelId', label: 'Canale lobby', type: 'channel' },
          { key: 'categoryId', label: 'Categoria stanze', type: 'channel' },
        ],
      },
      {
        module: 'ai', title: 'AI', icon: '🤖', section: 'AI & Extra',
        description: 'Risposte automatiche e assistenza contestuale.',
        fields: [
          { key: 'mentionReply', label: 'Risposta alle menzioni', type: 'bool' },
          { key: 'automodAI', label: 'Automod AI', type: 'bool' },
          { key: 'ticketAI', label: 'AI nei ticket', type: 'bool' },
          { key: 'funAI', label: 'AI divertente', type: 'bool' },
          { key: 'systemPrompt', label: 'Prompt di sistema', type: 'text', multiline: true, placeholder: 'Sei un moderatore gentile…' },
        ],
      },
      {
        module: 'starboard', title: 'Starboard', icon: '🌟', section: 'AI & Extra',
        description: 'Messaggi in evidenza dopo N reazioni.',
        fields: [
          { key: 'channelId', label: 'Canale starboard', type: 'channel' },
          { key: 'threshold', label: 'Reazioni necessarie', type: 'number' },
          { key: 'emoji', label: 'Emoji', type: 'emoji' },
        ],
      },
      {
        module: 'confessioni', title: 'Confessioni', icon: '🤫', section: 'AI & Extra',
        description: 'Confessioni anonime con cooldown anti-abuso.',
        fields: [
          { key: 'channelId', label: 'Canale confessioni', type: 'channel' },
        ],
      },
      {
        module: 'autoresponder', title: 'Risposte automatiche', icon: '💬', section: 'AI & Extra',
        description: 'Trigger parola → risposta. Usa il pannello dedicato sotto.',
        fields: [],
        custom: 'autoresponder',
      },
      {
        module: 'commands', title: 'Comandi custom (!nome)', icon: '⌨️', section: 'AI & Extra',
        description: 'Comandi testuali !nome con variabili {user} {server} {count}. Usa il pannello dedicato sotto.',
        fields: [],
        custom: 'commands',
      },
      ];
      // Hook moduli extra: accoda EXTRA_SCHEMA se presente (require-safe).
      try {
        const xm = safeRequire('./modules-extra');
        if (xm && Array.isArray(xm.EXTRA_SCHEMA) && xm.EXTRA_SCHEMA.length > 0) {
          return res.json(sanitizeForJson(baseSchema.concat(xm.EXTRA_SCHEMA)));
        }
      } catch { /* extra opzionale: mai 500 per questo */ }
      return res.json(sanitizeForJson(baseSchema));
    } catch (e) {
      logDashboardError('/api/guilds/:gid/schema', e);
      return res.status(500).json({ errore: 'Impossibile leggere lo schema.' });
    }
  });

  // ---- PUT /api/guilds/:gid/modules/:mod ---------------------------------
  router.put('/guilds/:gid/modules/:mod', loadAccess, async (req, res) => {
    const gid = req.params.gid;
    const mod = req.params.mod;
    const guild = req.access.guild;
    try {
      // --- Moduli lista (action-based): bypassano MODULE_FIELDS generico ---
      if (mod === 'autoresponder') return handleAutoresponder(gid, req, res);
      if (mod === 'commands') return handleCustomCommands(gid, req, res);
      if (mod === 'rewards') return handleRewards(gid, guild, req, res);

      const spec = MODULE_FIELDS[mod];
      if (!spec || mod === 'autoresponder' || mod === 'commands' || mod === 'rewards') {
        // Hook moduli extra: se MODULE_FIELDS non conosce il modulo, delega a writeExtra.
        try {
          const xm = safeRequire('./modules-extra');
          if (xm && typeof xm.writeExtra === 'function') {
            const extraBody = req.body && typeof req.body === 'object' ? req.body : {};
            try {
              const extraCfg = await xm.writeExtra(gid, mod, extraBody, guild);
              if (extraCfg === null || extraCfg === undefined) {
                return res.status(400).json({ errore: `Modulo sconosciuto: ${mod}.` });
              }
              return res.json(sanitizeForJson({ ok: true, module: mod, config: extraCfg }));
            } catch (we) {
              const st = we && Number.isFinite(we.status) ? we.status : 500;
              const msg = we && we.message ? we.message : 'Scrittura modulo extra fallita.';
              if (st !== 500) return res.status(st).json({ errore: msg });
              logDashboardError('PUT module extra', we);
              return res.status(500).json({ errore: 'Salvataggio fallito, riprova.' });
            }
          }
        } catch { /* extra opzionale: fallback al 400 sotto */ }
        return res.status(400).json({ errore: `Modulo sconosciuto: ${mod}.` });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const keys = Object.keys(body);
      if (keys.length === 0) return res.status(400).json({ errore: 'Body vuoto: niente da salvare.' });
      for (const k of keys) {
        if (!spec[k]) return res.status(400).json({ errore: `Chiave non valida per ${mod}: ${k}.` });
        if (!checkType(spec[k], body[k])) {
          return res.status(400).json({ errore: `Tipo non valido per ${k}: atteso ${spec[k]}.` });
        }
      }
      const NUMBER_RANGES = {
        maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90],
        maxCapsPercent: [10, 100], threshold: [1, 100], delaySeconds: [0, 3600],
      };
      const TEXT_LIMITS = {
        welcomeMessage: 500, goodbyeMessage: 500, systemPrompt: 1000, badWords: 1000,
      };
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
          if (!isSnowflake(v)) {
            return res.status(400).json({ errore: `Canale non valido per ${k}.` });
          }
          const r = await resolveChannel(guild, v);
          if (r.invalid || r.missing) {
            return res.status(400).json({ errore: `Canale non trovato in questo server per ${k}.` });
          }
        } else if (spec[k] === 'roles') {
          const r = resolveRoles(guild, v);
          if (r.invalid) return res.status(400).json({ errore: 'ID ruolo non valido.' });
          if (r.missing) return res.status(400).json({ errore: 'Un ruolo selezionato non esiste più: ricarica la pagina.' });
          if (r.managed) return res.status(400).json({ errore: 'I ruoli dei bot non possono essere autorole.' });
          v = r.roles;
        } else if (spec[k] === 'lang') {
          if (v !== 'it' && v !== 'en') return res.status(400).json({ errore: 'Lingua non valida (it/en).' });
        } else if (spec[k] === 'emoji' && typeof v === 'string') {
          v = v.slice(0, 50).trim() || '⭐';
        }
        patch[k] = v;
      }

      const guildConfig = safeRequire('../database/guildConfig');
      const tickets = safeRequire('../database/tickets');
      const tempvoice = safeRequire('../database/tempvoice');
      const aiConfig = safeRequire('../database/aiConfig');
      const autorole = safeRequire('../database/autorole');
      const starboard = safeRequire('../database/starboard');
      const confessioni = safeRequire('../database/confessioni');
      let updated;

      switch (mod) {
        case 'general': {
          if (!guildConfig) return res.status(500).json({ errore: 'Modulo guildConfig non disponibile.' });
          const { language, logChannelId, suggestChannelId, levelupChannelId, levelupEnabled } = patch;
          const p = {};
          if (language !== undefined) p.language = language;
          if (logChannelId !== undefined) p.logChannelId = logChannelId;
          if (suggestChannelId !== undefined) p.suggestChannelId = suggestChannelId;
          if (levelupChannelId !== undefined) p.levelupChannelId = levelupChannelId;
          if (levelupEnabled !== undefined) p.levelupEnabled = levelupEnabled;
          updated = guildConfig.updateGuild(gid, p);
          break;
        }
        case 'welcome':
        case 'logging':
        case 'levels':
          if (!guildConfig) return res.status(500).json({ errore: 'Modulo guildConfig non disponibile.' });
          updated = guildConfig.updateGuild(gid, patch);
          break;
        case 'automod': {
          if (!guildConfig) return res.status(500).json({ errore: 'Modulo guildConfig non disponibile.' });
          const p = { ...patch };
          if (typeof p.badWords === 'string') {
            p.badWords = p.badWords.split(/[,;\n]+/).map((w) => w.trim().toLowerCase())
              .filter(Boolean).slice(0, 50).map((w) => w.slice(0, 30));
          }
          updated = guildConfig.updateGuild(gid, { automod: p });
          break;
        }
        case 'autorole':
          if (!autorole) return res.status(501).json({ errore: 'Modulo autorole non ancora disponibile.' });
          updated = autorole.setConfig(gid, patch);
          break;
        case 'starboard':
          if (!starboard) return res.status(501).json({ errore: 'Modulo starboard non ancora disponibile.' });
          updated = starboard.setStarboard(gid, patch);
          break;
        case 'confessioni':
          if (!confessioni) return res.status(501).json({ errore: 'Modulo confessioni non ancora disponibile.' });
          if (patch.channelId === null) updated = confessioni.disableConfessioni(gid);
          else {
            updated = confessioni.setCanale(gid, patch.channelId);
          }
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
      return res.json(sanitizeForJson({ ok: true, module: mod, config: updated }));
    } catch (e) {
      logDashboardError('PUT module', e);
      return res.status(500).json({ errore: 'Salvataggio fallito, riprova.' });
    }
  });

  function handleAutoresponder(gid, req, res) {
    const autoresponder = safeRequire('../database/autoresponder');
    if (!autoresponder) return res.status(501).json({ errore: 'Modulo risposte automatiche non disponibile.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action;
    if (action === 'add') {
      const match = typeof body.match === 'string' ? body.match.trim().slice(0, 200) : '';
      const response = typeof body.response === 'string' ? body.response.slice(0, 1500) : '';
      const mode = body.mode === 'exact' || body.mode === 'regex' ? body.mode : 'include';
      if (!match || !response) return res.status(400).json({ errore: 'Parola e risposta sono obbligatorie.' });
      const r = autoresponder.addTrigger(gid, { match, response, mode });
      if (!r || !r.ok) return res.status(400).json({ errore: (r && r.error) || 'Creazione trigger fallita.' });
      return res.json({ ok: true, module: 'autoresponder', trigger: r.trigger, list: autoresponder.listTriggers(gid) });
    }
    if (action === 'remove') {
      if (typeof body.id !== 'string' || !body.id) return res.status(400).json({ errore: 'ID trigger mancante.' });
      const ok = autoresponder.removeTrigger(gid, body.id);
      if (!ok) return res.status(404).json({ errore: 'Trigger non trovato.' });
      return res.json({ ok: true, module: 'autoresponder', list: autoresponder.listTriggers(gid) });
    }
    return res.status(400).json({ errore: 'Action non valida (add/remove).' });
  }

  function handleCustomCommands(gid, req, res) {
    const customCommands = safeRequire('../database/customCommands');
    if (!customCommands) return res.status(501).json({ errore: 'Modulo comandi custom non disponibile.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action;
    if (action === 'create' || action === 'update') {
      const name = typeof body.name === 'string' ? body.name.trim().toLowerCase().slice(0, 20) : '';
      const response = typeof body.response === 'string' ? body.response.slice(0, 1500) : '';
      if (!name || !response) return res.status(400).json({ errore: 'Nome e risposta sono obbligatorie.' });
      const r = action === 'create'
        ? customCommands.create(gid, name, response, null)
        : customCommands.update(gid, name, response);
      if (!r || !r.ok) return res.status(400).json({ errore: (r && r.error) || 'Salvataggio fallito.' });
      return res.json({ ok: true, module: 'commands', command: r.command || r, list: customCommands.list(gid) });
    }
    if (action === 'remove') {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return res.status(400).json({ errore: 'Nome comando mancante.' });
      }
      const ok = customCommands.delete(gid, body.name.trim().toLowerCase());
      if (!ok) return res.status(404).json({ errore: 'Comando non trovato.' });
      return res.json({ ok: true, module: 'commands', list: customCommands.list(gid) });
    }
    return res.status(400).json({ errore: 'Action non valida (create/update/remove).' });
  }

  function handleRewards(gid, guild, req, res) {
    const levelRewards = safeRequire('../database/levelRewards');
    if (!levelRewards) return res.status(501).json({ errore: 'Modulo ricompense non disponibile.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action;
    if (action === 'set') {
      const level = Math.floor(Number(body.level));
      if (!Number.isFinite(level) || level < 1 || level > 100) {
        return res.status(400).json({ errore: 'Livello non valido (1-100).' });
      }
      if (!isSnowflake(body.roleId)) return res.status(400).json({ errore: 'Ruolo non valido.' });
      const role = guild.roles.cache.get(body.roleId);
      if (!role) return res.status(400).json({ errore: 'Ruolo non trovato in questo server.' });
      try {
        const r = levelRewards.setReward(gid, level, body.roleId);
        return res.json({ ok: true, module: 'rewards', reward: r, list: levelRewards.listRewards(gid) });
      } catch (e) {
        return res.status(400).json({ errore: e.message });
      }
    }
    if (action === 'remove') {
      const level = Math.floor(Number(body.level));
      if (!Number.isFinite(level) || level < 1 || level > 100) {
        return res.status(400).json({ errore: 'Livello non valido (1-100).' });
      }
      levelRewards.removeReward(gid, level);
      return res.json({ ok: true, module: 'rewards', list: levelRewards.listRewards(gid) });
    }
    return res.status(400).json({ errore: 'Action non valida (set/remove).' });
  }

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
      logDashboardError('PUT perms', e);
      return res.status(500).json({ errore: 'Salvataggio permessi fallito, riprova.' });
    }
  });

  return router;
}

module.exports = { createApiRouter, MODULE_FIELDS };
