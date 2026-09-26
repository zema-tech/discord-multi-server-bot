'use strict';
/**
 * src/mcp/server.js — MCP Streamable HTTP: POST /mcp (+ GET SSE, DELETE).
 *
 * Sessioni come da spec: initialize -> Mcp-Session-Id, poi il client lo
 * rimanda. GET apre uno stream SSE di keepalive/eventi. DELETE chiude.
 * Auth Bearer personale su ogni chiamata (vedi auth.js + /token crea).
 */
const crypto = require('crypto');
const { PROTOCOL_VERSION, SERVER_INFO, ERR, ok, fail, parseEnvelope } = require('./protocol');
const { authenticate, sessions, pruneSessions, sessionId } = require('./auth');
const { listDefs, getTool } = require('./tools');

function newSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Stream SSE aperti: sessionId -> Set(res).
const streams = new Map();

function pushEvent(sid, event, data) {
  try {
    const set = streams.get(sid);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try {
        res.write(payload);
      } catch {}
    }
  } catch {}
}

function requireSession(req) {
  pruneSessions();
  const sid = sessionId(req);
  if (!sid) return null; // stateless: ok senza sessione
  const s = sessions.get(sid);
  if (!s) {
    const e = new Error('Sessione sconosciuta o scaduta: riesegui initialize.');
    e.code = ERR.INVALID_PARAMS;
    e.status = 404;
    throw e;
  }
  return s;
}

async function dispatch(body, tokenRec) {
  const { id, method, params } = parseEnvelope(body);
  if (method.startsWith('notifications/')) return { status: 202, payload: null, id };
  if (method === 'initialize') {
    const sid = newSessionId();
    sessions.set(sid, { tokenRec, createdAt: Date.now() });
    return { status: 200, payload: ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO }), session: sid, id };
  }
  if (method === 'ping') return { status: 200, payload: ok(id, {}), id };
  if (method === 'tools/list') {
    return { status: 200, payload: ok(id, { tools: listDefs() }), id };
  }
  if (method === 'tools/call') {
    const tool = getTool(params.name);
    if (!tool) {
      const e = new Error(`Tool sconosciuto: ${params.name}`);
      e.code = ERR.INVALID_PARAMS;
      throw e;
    }
    const result = await tool.run(params.arguments, tokenRec);
    return { status: 200, payload: ok(id, result), id };
  }
  const e = new Error(`Metodo sconosciuto: ${method}`);
  e.code = ERR.METHOD_NOT_FOUND;
  throw e;
}

/** Monta POST/GET/DELETE /mcp su app Express. Ritorna true. */
function mountMcp(app) {
  // POST: unico ingresso JSON-RPC (auth Bearer obbligatoria).
  app.post('/mcp', async (req, res) => {
    let id = null;
    try {
      id = req.body && req.body.id !== undefined ? req.body.id : null;
      const tokenRec = authenticate(req);
      if (!tokenRec) return res.status(401).json(fail(id, ERR.UNAUTHORIZED, 'Token mancante o non valido. Creane uno con /token crea.'));
      try {
        requireSession(req); // valida sessione se il client ne invia una
      } catch (e) {
        return res.status(e.status || 400).json(fail(id, e.code || ERR.INVALID_PARAMS, e.message));
      }
      const out = await dispatch(req.body, tokenRec);
      if (out.session) res.setHeader('Mcp-Session-Id', out.session);
      if (out.payload === null) return res.status(out.status).end();
      return res.status(out.status).json(out.payload);
    } catch (e) {
      const code = Number.isFinite(e.code) ? e.code : ERR.INTERNAL;
      const status = code === ERR.INVALID_PARAMS || code === ERR.FORBIDDEN_GUILD ? 400 : code === ERR.METHOD_NOT_FOUND ? 404 : 500;
      return res.status(status).json(fail(id, code, e.message || 'Errore MCP.'));
    }
  });

  // GET: stream SSE (auth obbligatoria, sessione obbligatoria).
  app.get('/mcp', async (req, res) => {
    try {
      const tokenRec = authenticate(req);
      if (!tokenRec) return res.status(401).json(fail(null, ERR.UNAUTHORIZED, 'Token mancante o non valido.'));
      const sid = sessionId(req);
      const s = (sid && sessions.get(sid)) || null;
      if (!sid || !s) {
        return res.status(400).json(fail(null, ERR.INVALID_PARAMS, 'Serve Mcp-Session-Id da initialize.'));
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`event: ready\ndata: ${JSON.stringify({ session: sid })}\n\n`);
      if (!streams.get(sid)) streams.set(sid, new Set());
      streams.get(sid).add(res);
      const ping = setInterval(() => {
        try {
          res.write(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
        } catch {}
      }, 30000);
      if (ping.unref) ping.unref();
      req.on('close', () => {
        try {
          clearInterval(ping);
          const set = streams.get(sid);
          if (set) {
            set.delete(res);
            if (!set.size) streams.delete(sid);
          }
        } catch {}
      });
    } catch (e) {
      try {
        res.status(500).json(fail(null, ERR.INTERNAL, e.message || 'Errore MCP.'));
      } catch {}
    }
  });

  // DELETE: chiude la sessione.
  app.delete('/mcp', async (req, res) => {
    try {
      const tokenRec = authenticate(req);
      if (!tokenRec) return res.status(401).json(fail(null, ERR.UNAUTHORIZED, 'Token mancante o non valido.'));
      const sid = sessionId(req);
      if (sid) {
        sessions.delete(sid);
        streams.delete(sid);
      }
      return res.status(200).json(ok(null, { closed: true }));
    } catch (e) {
      return res.status(500).json(fail(null, ERR.INTERNAL, e.message || 'Errore MCP.'));
    }
  });

  return true;
}

module.exports = { mountMcp, dispatch, pushEvent, sessions, PROTOCOL_VERSION, SERVER_INFO };
