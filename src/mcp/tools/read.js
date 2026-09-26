'use strict';
/**
 * mcp/tools/read.js — tool MCP di SOLA LETTURA (telecomando: osserva il bot).
 *
 * Regole: mai scritture DB, mai chiamate Discord in POST. Ogni tool richiede
 * `guildId` che deve matchare il server del token (scope via scope.js).
 * I top accettano `limit` (default 10, max 25). canali/ruoli leggono le REST
 * live con Bot token (stesso comportamento della dashboard).
 */

const { assertGuild, rosterStatus, capLimit, textResult, toolError, ERR } = require('./scope');

function commander() {
  return require('../../modules/commander');
}

function gidProp() {
  return { guildId: { type: 'string', description: 'ID server (deve matchare il token)' } };
}

const guildInfo = {
  def: {
    name: 'guild_info',
    description: 'Scheda server: nome e membri dal roster presence, moduli on/off, ticket aperti, skill/note.',
    inputSchema: { type: 'object', properties: { ...gidProp() }, required: ['guildId'], additionalProperties: false },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const c = commander();
    const roster = rosterStatus(gid);
    const health = c.moduleHealth(gid);
    const out = {
      guildId: gid,
      roster: roster.entry,
      rosterUpdatedAt: roster.updatedAt,
      botPresente: roster.present,
      modules: { total: health.length, on: health.filter((m) => m.enabled && !m.isolated).length },
    };
    try {
      const tickets = require('../../database/tickets');
      out.ticketsOpen = tickets.getStats(gid).open;
    } catch {}
    try {
      out.notes = require('../../ai/brain/memory').listNotes(gid).length;
    } catch {}
    try {
      out.skills = require('../../ai/brain/skills').listSkills(gid).length;
    } catch {}
    return textResult(JSON.stringify(out));
  },
};

const economyTop = {
  def: {
    name: 'economy_top',
    description: 'Top portafogli (saldo+banca) del server.',
    inputSchema: {
      type: 'object',
      properties: { ...gidProp(), limit: { type: 'integer', minimum: 1, maximum: 25 } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const eco = require('../../database/economy');
    return textResult(JSON.stringify(eco.getLeaderboard(gid, capLimit(args.limit, 10, 25))));
  },
};

const levelsTop = {
  def: {
    name: 'levels_top',
    description: 'Top livelli/XP del server.',
    inputSchema: {
      type: 'object',
      properties: { ...gidProp(), limit: { type: 'integer', minimum: 1, maximum: 25 } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const levels = require('../../database/levels');
    const top = levels.getLeaderboard(gid, capLimit(args.limit, 10, 25))
      .map((e) => ({ id: e.id, level: e.level, xp: e.xp, total: e.total }));
    return textResult(JSON.stringify(top));
  },
};

const modHistory = {
  def: {
    name: 'mod_history',
    description: 'Storico moderazione di un utente (warn/ban/kick/timeout).',
    inputSchema: {
      type: 'object',
      properties: {
        ...gidProp(),
        userId: { type: 'string', description: 'ID utente' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
      required: ['guildId', 'userId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const uid = String(args.userId || '').trim();
    if (!uid) throw toolError(ERR.INVALID_PARAMS, 'userId mancante.');
    const cases = require('../../database/cases');
    const list = cases.getUserCases(gid, uid, capLimit(args.limit, 10, 25))
      .map((c) => ({ id: c.id, type: c.type, reason: c.reason || null, modId: c.modId || null, createdAt: c.createdAt || null }));
    return textResult(JSON.stringify(list));
  },
};

const analyticsSummary = {
  def: {
    name: 'analytics_summary',
    description: 'Attività server: messaggi/ingressi/uscite sommati sugli ultimi N giorni.',
    inputSchema: {
      type: 'object',
      properties: { ...gidProp(), days: { type: 'integer', minimum: 1, maximum: 30 } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const analytics = require('../../database/analytics');
    const days = capLimit(args.days, 7, 30);
    return textResult(JSON.stringify({ days, ...analytics.totals(gid, days) }));
  },
};

const configGet = {
  def: {
    name: 'config_get',
    description: 'Configurazione del server (lingua, canali log, livelli, automod): sola lettura.',
    inputSchema: { type: 'object', properties: { ...gidProp() }, required: ['guildId'], additionalProperties: false },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const guildConfig = require('../../database/guildConfig');
    return textResult(JSON.stringify(guildConfig.getGuild(gid)));
  },
};

const shopList = {
  def: {
    name: 'shop_list',
    description: 'Catalogo ruoli in vendita nel negozio del server.',
    inputSchema: { type: 'object', properties: { ...gidProp() }, required: ['guildId'], additionalProperties: false },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const shop = require('../../database/shop');
    return textResult(JSON.stringify(shop.listItems(gid)));
  },
};

const invitesTop = {
  def: {
    name: 'invites_top',
    description: 'Top invitanti del server.',
    inputSchema: {
      type: 'object',
      properties: { ...gidProp(), limit: { type: 'integer', minimum: 1, maximum: 25 } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const invites = require('../../database/invites');
    return textResult(JSON.stringify(invites.getLeaderboard(gid, capLimit(args.limit, 10, 25))));
  },
};

const channelsList = {
  def: {
    name: 'channels_list',
    description: 'Canali del server (live da Discord: id, nome, tipo).',
    inputSchema: { type: 'object', properties: { ...gidProp() }, required: ['guildId'], additionalProperties: false },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const rest = require('../../dashboard/discordRest');
    try {
      return textResult(JSON.stringify(await rest.getChannels(gid)));
    } catch (e) {
      throw toolError(ERR.INTERNAL, e.message || 'Lettura canali fallita.');
    }
  },
};

const rolesList = {
  def: {
    name: 'roles_list',
    description: 'Ruoli del server (live da Discord: id, nome, colore).',
    inputSchema: { type: 'object', properties: { ...gidProp() }, required: ['guildId'], additionalProperties: false },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const rest = require('../../dashboard/discordRest');
    try {
      return textResult(JSON.stringify(await rest.getRoles(gid)));
    } catch (e) {
      throw toolError(ERR.INTERNAL, e.message || 'Lettura ruoli fallita.');
    }
  },
};

module.exports = {
  guildInfo, economyTop, levelsTop, modHistory, analyticsSummary,
  configGet, shopList, invitesTop, channelsList, rolesList,
};
