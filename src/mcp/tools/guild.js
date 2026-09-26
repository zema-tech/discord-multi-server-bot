'use strict';
/**
 * mcp/tools/guild.js — istantanea server: moduli, ticket, livelli.
 */
const { textResult, toolError, ERR } = require('../protocol');

function commander() {
  return require('../../modules/commander');
}

function assertGuild(tokenRec, guildId) {
  const gid = String(guildId || '');
  if (!gid) throw toolError(ERR.INVALID_PARAMS, 'guildId mancante.');
  if (gid !== tokenRec.guildId) throw toolError(ERR.FORBIDDEN_GUILD, 'Token non valido per questo server.');
  return gid;
}

const guildSnapshot = {
  def: {
    name: 'guild_snapshot',
    description: 'Istantanea: moduli attivi, ticket (aperti/chiusi/rating), top livelli.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const c = commander();
    const health = c.moduleHealth(gid);
    const snap = {
      modules: { total: health.length, on: health.filter((m) => m.enabled && !m.isolated).length, isolated: health.filter((m) => m.isolated).length },
    };
    try {
      const tickets = require('../../database/tickets');
      const st = tickets.getStats(gid);
      snap.tickets = { open: st.open, closed: st.closed, avgCloseMin: st.avgCloseMin, avgRating: st.avgRating };
      snap.staff = tickets.getStaffStats(gid, 3);
    } catch {}
    try {
      const levels = require('../../database/levels');
      snap.levelTop = levels.getLeaderboard(gid, 5).map((e) => ({ id: e.id, level: e.level, total: e.total }));
    } catch {}
    return textResult(JSON.stringify(snap));
  },
};

const ticketStats = {
  def: {
    name: 'ticket_stats',
    description: 'Statistiche ticket: totali, per tipo, chiusura media, rating, top staff.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const tickets = require('../../database/tickets');
    const st = tickets.getStats(gid);
    return textResult(JSON.stringify({ ...st, staff: tickets.getStaffStats(gid, 5) }));
  },
};

module.exports = { guildSnapshot, ticketStats };
