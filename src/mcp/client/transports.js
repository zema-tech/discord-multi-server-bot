'use strict';
/**
 * mcp/client/transports.js — trasporti MCP direzione B (stile Hermes).
 *
 * - StdioTransport: subprocess locale (npx/node/…) con JSON-RPC line-delimited.
 * - HttpTransport: Streamable HTTP (POST JSON-RPC, header Mcp-Session-Id).
 * Zero dipendenze: child_process + fetch nativa. Sanitizzazione anti-injection
 * (TAG invisibili U+E0000–U+E007F) come Hermes su ogni risultato testuale.
 */

const { spawn } = require('child_process');
const { stdioEnv } = require('./config');

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'discord-multi-server-bot', version: '1.0.0' };

/** Rimuove i TAG invisibili U+E0000–U+E007F (canale di prompt-injection). */
function sanitizeText(s) {
  try {
    return String(s ?? '').replace(/[\u{E0000}-\u{E007F}]/gu, '');
  } catch {
    return String(s ?? '');
  }
}

function sanitizeDeep(node) {
  if (typeof node === 'string') return sanitizeText(node);
  if (Array.isArray(node)) return node.map(sanitizeDeep);
  if (node && typeof node === 'object') {
    const out = Array.isArray(node) ? [] : {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '_meta' && v && typeof v === 'object' && !Array.isArray(v)) {
        const meta = {};
        for (const [mk, mv] of Object.entries(v)) {
          if (/^(modelcontextprotocol|mcp)[./:]/i.test(mk)) continue; // chiavi riservate protocollo
          meta[mk] = sanitizeDeep(mv);
        }
        if (Object.keys(meta).length) out[k] = meta;
        continue;
      }
      out[k] = sanitizeDeep(v);
    }
    return out;
  }
  return node;
}

function rpcError(code, message, data) {
  const e = new Error(message);
  e.code = code;
  if (data !== undefined) e.data = data;
  return e;
}

let nextId = 1;

/** Transport stdio: una riga JSON per messaggio su stdin/stdout. */
class StdioTransport {
  constructor(cfg) {
    this.cfg = cfg;
    this.child = null;
    this.buf = '';
    this.pending = new Map();
    this.capabilities = {};
  }

  connect() {
    if (this.child) return Promise.resolve(this.capabilities);
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(this.cfg.command, this.cfg.args || [], {
          env: stdioEnv(this.cfg),
          cwd: this.cfg.cwd || process.cwd(),
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch (e) {
        return reject(rpcError('spawn', `Avvio MCP "${this.cfg.name}" fallito: ${e.message}`));
      }
      this.child = child;
      const timer = setTimeout(() => {
        this.close();
        reject(rpcError('timeout', `Init MCP "${this.cfg.name}" timeout.`));
      }, this.cfg.timeout || 30000);
      if (timer.unref) timer.unref();

      child.on('error', (e) => {
        clearTimeout(timer);
        this._failAll(e);
        reject(rpcError('spawn', `Processo MCP "${this.cfg.name}" errore: ${e.message}`));
      });
      child.on('exit', () => this._failAll(new Error(`Processo MCP "${this.cfg.name}" terminato.`)));
      child.stdout.on('data', (chunk) => this._onData(chunk));

      this._request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      }, 25000).then((res) => {
        clearTimeout(timer);
        this.capabilities = (res && res.capabilities) || {};
        // notifications/initialized: best-effort, senza risposta attesa
        try { this._notify('notifications/initialized', {}); } catch {}
        resolve(this.capabilities);
      }).catch((e) => {
        clearTimeout(timer);
        this.close();
        reject(e);
      });
    });
  }

  _onData(chunk) {
    this.buf += String(chunk || '');
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const id = msg && msg.id;
      if (id === undefined || id === null || !this.pending.has(id)) continue;
      const { resolve, reject, timer } = this.pending.get(id);
      this.pending.delete(id);
      clearTimeout(timer);
      if (msg.error) reject(rpcError(msg.error.code ?? -32000, msg.error.message || 'Errore MCP.', msg.error.data));
      else resolve(msg.result);
    }
  }

  _failAll(err) {
    for (const [, p] of this.pending) {
      try { clearTimeout(p.timer); p.reject(err); } catch {}
    }
    this.pending.clear();
  }

  _send(obj) {
    if (!this.child || !this.child.stdin || !this.child.stdin.writable) {
      throw rpcError('closed', `Transport MCP "${this.cfg.name}" chiuso.`);
    }
    this.child.stdin.write(`${JSON.stringify(obj)}\n`);
  }

  _request(method, params, timeoutMs) {
    const id = nextId++;
    const ms = timeoutMs || this.cfg.timeout || 30000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(rpcError('timeout', `MCP "${this.cfg.name}" ${method}: timeout ${ms}ms.`));
      }, ms);
      if (timer.unref) timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try {
        this._send({ jsonrpc: '2.0', id, method, params: params || {} });
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  _notify(method, params) {
    try { this._send({ jsonrpc: '2.0', method, params: params || {} }); } catch {}
  }

  async listTools() {
    await this.connect();
    const res = await this._request('tools/list', {});
    const tools = Array.isArray(res && res.tools) ? res.tools : [];
    return sanitizeDeep(tools);
  }

  async callTool(name, args) {
    await this.connect();
    const res = await this._request('tools/call', { name, arguments: args || {} });
    return sanitizeDeep(res);
  }

  async listResources() {
    await this.connect();
    const res = await this._request('resources/list', {});
    return sanitizeDeep((res && res.resources) || []);
  }

  async callUtility(method, params) {
    await this.connect();
    const res = await this._request(method, params || {});
    return sanitizeDeep(res);
  }

  close() {
    try {
      for (const [, p] of this.pending) {
        try { clearTimeout(p.timer); p.reject(new Error('Transport chiuso.')); } catch {}
      }
      this.pending.clear();
      if (this.child) { try { this.child.kill(); } catch {} }
    } catch {}
    this.child = null;
    this.buf = '';
  }
}

/** Transport Streamable HTTP: POST JSON-RPC, sessione via Mcp-Session-Id. */
class HttpTransport {
  constructor(cfg) {
    this.cfg = cfg;
    this.sessionId = null;
    this.capabilities = {};
  }

  async _post(method, params, timeoutMs) {
    const ms = timeoutMs || this.cfg.timeout || 30000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    if (timer.unref) timer.unref();
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
      for (const [k, v] of Object.entries(this.cfg.headers || {})) headers[k] = String(v);
      if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
      const res = await fetch(this.cfg.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params: params || {} }),
        signal: ctrl.signal,
      });
      const sid = res.headers && typeof res.headers.get === 'function'
        ? (res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id'))
        : null;
      if (sid) this.sessionId = sid;
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        const hint = res.status === 401 || res.status === 403
          ? ' (token/OAuth non valido)'
          : (res.status === 400 || res.status === 405 ? ' (endpoint non-MCP o solo-SSE?)' : '');
        throw rpcError('http', `MCP http "${this.cfg.name}": HTTP ${res.status}${hint} ${String(text).slice(0, 200)}`);
      }
      // Risposta SSE incapsulata? estrai il primo data: JSON
      const body = String(text || '').trim();
      if (/^event:/m.test(body)) {
        const m = body.match(/^data:\s*(\{.*\})$/m);
        if (!m) throw rpcError('parse', `MCP http "${this.cfg.name}": SSE senza data JSON.`);
        const msg = JSON.parse(m[1]);
        if (msg.error) throw rpcError(msg.error.code ?? -32000, msg.error.message || 'Errore MCP.');
        return msg.result;
      }
      if (!body) return {};
      const msg = JSON.parse(body);
      if (msg.error) throw rpcError(msg.error.code ?? -32000, msg.error.message || 'Errore MCP.', msg.error.data);
      return msg.result;
    } catch (e) {
      if (e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''))) {
        throw rpcError('timeout', `MCP http "${this.cfg.name}" ${method}: timeout ${ms}ms.`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async connect() {
    if (this.sessionId && Object.keys(this.capabilities).length) return this.capabilities;
    try {
      const res = await this._post('initialize', {
        protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO,
      }, 25000);
      this.capabilities = (res && res.capabilities) || {};
    } catch (e) {
      // Alcuni server accettano tools/list senza initialize: non bloccare la discovery
      this.capabilities = {};
      if (e && (e.code === 'timeout' || e.code === 'http')) throw e;
    }
    return this.capabilities;
  }

  async listTools() {
    await this.connect();
    const res = await this._post('tools/list', {});
    return sanitizeDeep(Array.isArray(res && res.tools) ? res.tools : []);
  }

  async callTool(name, args) {
    await this.connect();
    const res = await this._post('tools/call', { name, arguments: args || {} });
    return sanitizeDeep(res);
  }

  async callUtility(method, params) {
    await this.connect();
    return this._post(method, params || {});
  }

  close() {
    this.sessionId = null;
  }
}

function makeTransport(cfg) {
  if (cfg.command) return new StdioTransport(cfg);
  return new HttpTransport(cfg);
}

module.exports = {
  StdioTransport, HttpTransport, makeTransport,
  sanitizeText, sanitizeDeep, PROTOCOL_VERSION, CLIENT_INFO,
};
