'use strict';
/**
 * src/mcp/server.js — MCP server (Streamable HTTP) del bot.
 *
 * Claude (Code/Desktop/connector) si collega a POST /mcp con
 * `Authorization: Bearer <token personale>` (/token crea, owner-only) e
 * opera il bot SOLO nel server legato al token, via Commander:
 * moduli, salute, statistiche, cervello. Niente DB diretti, niente Discord
 * in scrittura oltre i toggle: il resto passa dal gate come tutto il resto.
 *
 * Protocollo minimo: initialize, notifications/*, ping, tools/list, tools/call.
 */
const { verifyToken } = require('../database/apiTokens');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'discord-multi-server-bot', version: '1.0.0' };

function textResult(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

function commander() {
  return require('../modules/commander');
}

/* ---------------- TOOL ---------------- */

const TOOLS = [
  {
    name: 'modules_list',
    description: 'Elenca i moduli del bot (id, titolo, versione, comandi).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'module_status',
    description: 'Salute dei moduli in un server: on/off, protezione, errori.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string', description: 'ID server (deve matchare il token)' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  {
    name: 'module_toggle',
    description: 'Accende/spegne un modulo in un server.',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        moduleId: { type: 'string', description: 'ID modulo (da modules_list)' },
        enabled: { type: 'boolean' },
      },
      required: ['guildId', 'moduleId', 'enabled'], additionalProperties: false,
    },
  },
  {
    name: 'guild_snapshot',
    description: 'Istantanea: moduli attivi, ticket (aperti/chiusi/rating), livelli top.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  {
    name: 'brain_search',
    description: 'Cerca nel cervello del server (skill, memorie, file).',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        query: { type: 'string', description: 'Cosa cercare' },
      },
      required: ['guildId', 'query'], additionalProperties: false,
    },
  },
  {
    name: 'ticket_stats',
    description: 'Statistiche ticket: totali, per tipo, chiusura media, rating, top staff.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
];

function assertGuild(tokenRec, guildId) {
  const gid = String(guildId || '');
  if (!gid) {
    const e = new Error('guildId mancante.');
    e.code = -32602;
    throw e;
  }
  if (gid !== tokenRec.guildId) {
    const e = new Error('Token non valido per questo server.');
    e.code = -32001;
    throw e;
  }
  return gid;
}

async function callTool(name, args, tokenRec) {
  const a = args && typeof args === 'object' ? args : {};
  const c = commander();
  switch (name) {
    case 'modules_list': {
      return textResult(JSON.stringify(c.listModules().map((m) => ({
        id: m.id, title: m.title, version: m.version, commands: m.commands,
      }))));
    }
    case 'module_status': {
      const gid = assertGuild(tokenRec, a.guildId);
      return textResult(JSON.stringify(c.moduleHealth(gid).map((m) => ({
        id: m.id, enabled: m.enabled, isolated: m.isolated, ok: m.ok,
        errors: (m.errors || []).length,
      }))));
    }
    case 'module_toggle': {
      const gid = assertGuild(tokenRec, a.guildId);
      if (typeof a.enabled !== 'boolean') {
        const e = new Error('enabled deve essere boolean.');
        e.code = -32602;
        throw e;
      }
      const entry = c.setModuleEnabled(gid, a.moduleId, a.enabled);
      return textResult(JSON.stringify({ id: entry?.id || a.moduleId, enabled: entry?.enabled ?? a.enabled }));
    }
    case 'guild_snapshot': {
      const gid = assertGuild(tokenRec, a.guildId);
      const health = c.moduleHealth(gid);
      const snap = {
        modules: { total: health.length, on: health.filter((m) => m.enabled && !m.isolated).length, isolated: health.filter((m) => m.isolated).length },
      };
      try {
        const tickets = require('../database/tickets');
        const st = tickets.getStats(gid);
        snap.tickets = { open: st.open, closed: st.closed, avgCloseMin: st.avgCloseMin, avgRating: st.avgRating };
        snap.staff = tickets.getStaffStats(gid, 3);
      } catch {}
      try {
        const levels = require('../database/levels');
        snap.levelTop = levels.getLeaderboard(gid, 5).map((e) => ({ id: e.id, level: e.level, total: e.total }));
      } catch {}
      return textResult(JSON.stringify(snap));
    }
    case 'brain_search': {
      const gid = assertGuild(tokenRec, a.guildId);
      const q = String(a.query || '').slice(0, 200);
      if (!q.trim()) {
        const e = new Error('query vuota.');
        e.code = -32602;
        throw e;
      }
      const { buildContext, sourcesLine } = require('../ai/brain/kernel');
      const ctx = buildContext({ guildId: gid, query: q });
      return textResult(JSON.stringify({ sources: sourcesLine(ctx.sources), excerpts: ctx.sources }));
    }
    case 'ticket_stats': {
      const gid = assertGuild(tokenRec, a.guildId);
      const tickets = require('../database/tickets');
      const st = tickets.getStats(gid);
      return textResult(JSON.stringify({ ...st, staff: tickets.getStaffStats(gid, 5) }));
    }
    default: {
      const e = new Error(`Tool sconosciuto: ${name}`);
      e.code = -32602;
      throw e;
    }
  }
}

/* ---------------- JSON-RPC ---------------- */

async function handleRpc(body, tokenRec) {
  const id = body && body.id !== undefined ? body.id : null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return { status: 400, payload: rpcError(id, -32600, 'Richiesta JSON-RPC non valida.') };
  }
  const method = body.method;
  if (method.startsWith('notifications/')) {
    return { status: 202, payload: null };
  }
  try {
    if (method === 'initialize') {
      return {
        status: 200,
        payload: {
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        },
      };
    }
    if (method === 'ping') {
      return { status: 200, payload: { jsonrpc: '2.0', id, result: {} } };
    }
    if (method === 'tools/list') {
      return { status: 200, payload: { jsonrpc: '2.0', id, result: { tools: TOOLS } } };
    }
    if (method === 'tools/call') {
      const p = body.params || {};
      const result = await callTool(p.name, p.arguments, tokenRec);
      return { status: 200, payload: { jsonrpc: '2.0', id, result } };
    }
    return { status: 404, payload: rpcError(id, -32601, `Metodo sconosciuto: ${method}`) };
  } catch (e) {
    const code = Number.isFinite(e.code) ? e.code : -32000;
    return { status: code === -32602 || code === -32001 ? 400 : 500, payload: rpcError(id, code, e.message || 'Errore.') };
  }
}

function bearerToken(req) {
  try {
    const h = req.headers.authorization || req.headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/** Monta POST /mcp su app Express. Ritorna true. */
function mountMcp(app) {
  app.post('/mcp', async (req, res) => {
    try {
      const rec = verifyToken(bearerToken(req));
      if (!rec) {
        return res.status(401).json(rpcError(req.body?.id, -32001, 'Token mancante o non valido. Creane uno con /token crea.'));
      }
      const { status, payload } = await handleRpc(req.body, rec);
      if (payload === null) return res.status(status).end();
      return res.status(status).json(payload);
    } catch (e) {
      return res.status(500).json(rpcError(req.body?.id, -32000, e.message || 'Errore MCP.'));
    }
  });
  return true;
}

module.exports = { mountMcp, handleRpc, callTool, TOOLS, PROTOCOL_VERSION, SERVER_INFO };
