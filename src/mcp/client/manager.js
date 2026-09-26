'use strict';
/**
 * mcp/client/manager.js — host MCP direzione B (stile Hermes).
 *
 * Discovery all'avvio da `mcp/servers.json`, prefisso anti-collisione
 * `mcp_<server>_<tool>`, filtri include/exclude con glob (*, ?),
 * wrapper utility (resources/prompts) solo se il server li supporta.
 * Mai DB, mai Discord qui: solo orchestrazione MCP.
 */

const { loadConfig, clientEnabled } = require('./config');
const { makeTransport } = require('./transports');

/** `nome server` -> slug sicuro per il prefisso (come Hermes: non-alfanum -> _). */
function slug(s) {
  return String(s || 'server').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'server';
}

function toolSlug(s) {
  return String(s || 'tool').replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/[.]/g, '_') || 'tool';
}

/** Glob semplice (*, ?) case-sensitive, come Hermes per tools.include/exclude. */
function globToRegExp(glob) {
  const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`);
}

function matchesAny(name, patterns) {
  if (!patterns || !patterns.length) return false;
  return patterns.some((p) => {
    if (/[*?[]/.test(p)) {
      try { return globToRegExp(p).test(name); } catch { return false; }
    }
    return p === name;
  });
}

/** Regola Hermes: include vince su exclude. */
function keepTool(name, toolsCfg) {
  const inc = toolsCfg && toolsCfg.include;
  const exc = toolsCfg && toolsCfg.exclude;
  if (inc && inc.length) return matchesAny(name, inc);
  if (exc && exc.length) return !matchesAny(name, exc);
  return true;
}

class McpManager {
  constructor(opts = {}) {
    this.env = opts.env || process.env;
    this.configPath = opts.path || null;
    this.registry = new Map(); // prefixedName -> { server, original, def, transport }
    this.servers = new Map(); // serverName -> { cfg, transport, tools, status, error, capabilities }
    this.warnings = [];
    this.started = false;
  }

  /** Discovery: connette i server abilitati e registra i tool filtrati. */
  async discover() {
    this.registry.clear();
    this.servers.clear();
    this.warnings = [];
    if (!clientEnabled(this.env)) {
      this.warnings.push('MCP client disattivato (MCP_ENABLED=0).');
      this.started = true;
      return this.summary();
    }
    const { servers, warnings } = loadConfig({ path: this.configPath, env: this.env });
    this.warnings.push(...warnings);
    const concurrency = 4; // come Hermes: max 4 connessioni in parallelo
    const entries = [...servers.values()].filter((c) => c.enabled);
    for (const s of servers.values()) {
      if (!s.enabled) this.servers.set(s.name, { cfg: s, transport: null, tools: [], status: 'disabled', error: null, capabilities: {} });
    }
    for (let i = 0; i < entries.length; i += concurrency) {
      const wave = entries.slice(i, i + concurrency);
      await Promise.all(wave.map((cfg) => this._connectOne(cfg)));
    }
    this.started = true;
    return this.summary();
  }

  async _connectOne(cfg) {
    const transport = makeTransport(cfg);
    try {
      const rawTools = await transport.listTools().catch(() => []);
      const caps = transport.capabilities || {};
      const kept = (Array.isArray(rawTools) ? rawTools : []).filter((t) => t && t.name && keepTool(t.name, cfg.tools));
      const sSlug = slug(cfg.name);
      for (const t of kept) {
        const prefixed = `mcp_${sSlug}_${toolSlug(t.name)}`;
        if (this.registry.has(prefixed)) continue;
        this.registry.set(prefixed, {
          server: cfg.name,
          original: t.name,
          def: {
            name: prefixed,
            description: String(t.description || `Tool ${t.name} via MCP ${cfg.name}`).slice(0, 500),
            inputSchema: (t.inputSchema && typeof t.inputSchema === 'object') ? t.inputSchema : { type: 'object' },
          },
          transport,
          cfg,
        });
      }
      // Utility resources/prompts solo se supportate (capability-aware come Hermes)
      const util = [];
      const hasRes = caps.resources || cfg.tools.resources !== false && false;
      void hasRes;
      const entry = { cfg, transport, tools: kept.map((t) => t.name), status: 'connected', error: null, capabilities: caps };
      // Prova leggera: se tools.resources/prompts abilitati, registra wrapper solo dopo probe ok
      if (cfg.tools.resources !== false) {
        try {
          const r = await transport.callUtility('resources/list', {}).catch(() => null);
          if (r && (Array.isArray(r.resources) || Array.isArray(r))) {
            util.push('resources');
            this._registerUtility(cfg, transport, 'list_resources');
            this._registerUtility(cfg, transport, 'read_resource');
          }
        } catch {}
      }
      if (cfg.tools.prompts !== false) {
        try {
          const p = await transport.callUtility('prompts/list', {}).catch(() => null);
          if (p && (Array.isArray(p.prompts) || Array.isArray(p))) {
            util.push('prompts');
            this._registerUtility(cfg, transport, 'list_prompts');
            this._registerUtility(cfg, transport, 'get_prompt');
          }
        } catch {}
      }
      entry.utility = util;
      this.servers.set(cfg.name, entry);
    } catch (e) {
      try { transport.close(); } catch {}
      this.servers.set(cfg.name, {
        cfg, transport: null, tools: [], status: 'failed',
        error: String((e && e.message) || e).slice(0, 300), capabilities: {},
      });
    }
  }

  _registerUtility(cfg, transport, utilName) {
    const prefixed = `mcp_${slug(cfg.name)}_${utilName}`;
    if (this.registry.has(prefixed)) return;
    this.registry.set(prefixed, {
      server: cfg.name,
      original: utilName,
      def: { name: prefixed, description: `Utility MCP ${utilName} su ${cfg.name}.`, inputSchema: { type: 'object' } },
      transport,
      cfg,
      utility: true,
    });
  }

  /**
   * Visibilità per guild stile Composio (sessioni per scope): `guilds: [...]`
   * nel server limita lista e chiamate a quei server; null = tutti.
   * Senza guildId nessun filtro (retrocompatibile).
   */
  visibleTo(entry, guildId) {
    if (!entry) return false;
    if (!guildId) return true;
    const allow = entry.cfg && entry.cfg.guilds;
    if (!allow) return true;
    return allow.includes(String(guildId));
  }

  listDefs(guildId = null) {
    return [...this.registry.values()]
      .filter((r) => this.visibleTo(r, guildId))
      .map((r) => r.def);
  }

  getTool(prefixed, guildId = null) {
    const entry = this.registry.get(String(prefixed)) || null;
    return this.visibleTo(entry, guildId) ? entry : null;
  }

  /**
   * Ricerca tool tra i server connessi (discovery runtime stile Composio):
   * match su nome, descrizione e server. Max 15.
   */
  searchTools(query, guildId = null, limit = 15) {
    const words = String(query || '').toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 2);
    if (!words.length) return [];
    const scored = [];
    for (const r of this.registry.values()) {
      if (!this.visibleTo(r, guildId)) continue;
      const hay = `${r.def.name} ${r.def.description || ''} ${r.server}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (r.def.name.toLowerCase().includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
      }
      if (score > 0) scored.push({ def: r.def, server: r.server, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ def, server, score }) => ({ ...def, server, score }));
  }

  /** Chiama un tool col nome prefissato. Ritorna testo pronto per la AI/chat. */
  async callTool(prefixed, args, guildId = null) {
    const entry = this.getTool(prefixed, guildId);
    if (!entry) {
      const e = new Error(`Tool MCP sconosciuto: ${prefixed}`);
      e.code = 'unknown_tool';
      throw e;
    }
    const t = entry.transport;
    let res;
    if (entry.utility) {
      const map = {
        list_resources: ['resources/list', args || {}],
        read_resource: ['resources/read', args || {}],
        list_prompts: ['prompts/list', args || {}],
        get_prompt: ['prompts/get', args || {}],
      };
      const [method, params] = map[entry.original] || ['tools/call', { name: entry.original, arguments: args || {} }];
      res = await t.callUtility(method, params);
    } else {
      res = await t.callTool(entry.original, args || {});
    }
    return { server: entry.server, tool: entry.original, result: res, text: resultToText(res) };
  }

  status() {
    return [...this.servers.values()].map((s) => ({
      name: s.cfg.name,
      transport: s.cfg.command ? 'stdio' : 'http',
      enabled: s.cfg.enabled,
      status: s.status,
      tools: s.tools.length,
      guilds: s.cfg.guilds,
      utility: s.utility || [],
      error: s.error,
    }));
  }

  summary() {
    const st = this.status();
    return {
      servers: st.length,
      connected: st.filter((s) => s.status === 'connected').length,
      failed: st.filter((s) => s.status === 'failed').length,
      tools: this.registry.size,
      warnings: [...this.warnings],
      status: st,
    };
  }

  async reload() {
    for (const s of this.servers.values()) {
      try { if (s.transport) s.transport.close(); } catch {}
    }
    return this.discover();
  }

  close() {
    for (const s of this.servers.values()) {
      try { if (s.transport) s.transport.close(); } catch {}
    }
  }

  /** Specs in formato OpenAI function-calling per la AI del bot. */
  toOpenAIFunctions(guildId = null) {
    return this.listDefs(guildId).map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.inputSchema,
    }));
  }
}

/** Estrae testo leggibile da un result MCP (content[] / testo libero). */
function resultToText(res) {
  try {
    if (res == null) return '';
    if (typeof res === 'string') return res.slice(0, 4000);
    const content = res.content || res.result || res.results;
    if (Array.isArray(content)) {
      return content
        .map((b) => (typeof b === 'string' ? b : (b && (b.text || b.data || ''))))
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);
    }
    return JSON.stringify(res).slice(0, 4000);
  } catch {
    return '';
  }
}

module.exports = { McpManager, keepTool, matchesAny, slug, resultToText };
