'use strict';
/**
 * mcp/tools/guild.js — istantanea server: moduli, ticket, livelli.
 */
const { assertGuild, textResult } = require('./scope');

function commander() {
  return require('../../modules/commander');
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

const ticketsOpen = {
  def: {
    name: 'tickets_open',
    description: 'Ticket aperti: numero, tipo, proprietario, priorità, data.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const tickets = require('../../database/tickets');
    const list = tickets.openTickets(gid)
      .filter((t) => t && t.status === 'open')
      .map((t) => ({
        number: t.number, type: t.type, ownerId: t.ownerId,
        priority: t.priority || 'normale', pinned: t.pinned === true,
        claimedBy: t.claimedBy || null, createdAt: t.createdAt || null,
      }))
      .sort((a, b) => (a.number || 0) - (b.number || 0))
      .slice(0, 50);
    return textResult(JSON.stringify(list));
  },
};

module.exports = { guildSnapshot, ticketStats, ticketsOpen };
