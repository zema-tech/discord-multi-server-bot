'use strict';
/**
 * mcp/client/config.js — loader config direzione B (stile Hermes `mcp_servers`).
 *
 * Legge `./mcp/servers.json` (override con MCP_SERVERS_PATH), accetta sia
 * `{ "mcp_servers": {...} }` sia mappa piatta. Normalizza ogni server:
 * `{ command,args,env,cwd,url,headers,timeout,enabled,tools:{include,exclude,resources,prompts} }`.
 * Espande `${VAR}` da process.env. MAI lancia se il file manca: ritorna mappa vuota.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = './mcp/servers.json';
const DEFAULT_TIMEOUT = 30000;

// Baseline sicura per stdio (come Hermes: solo env dichiarato + baseline, mai tutto process.env).
const SAFE_BASELINE_KEYS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ',
  'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'NODE_PATH',
];

function configPath(env = process.env) {
  const p = String((env && env.MCP_SERVERS_PATH) || DEFAULT_PATH).trim();
  return p || DEFAULT_PATH;
}

function defaultTimeout(env = process.env) {
  const n = Number.parseInt(String((env && env.MCP_TIMEOUT) || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT;
}

function expandVars(value, env = process.env) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => String(env[k] ?? ''));
}

function expandDeep(node, env) {
  if (typeof node === 'string') return expandVars(node, env);
  if (Array.isArray(node)) return node.map((v) => expandDeep(v, env));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (String(k).startsWith('_')) continue; // chiavi _comment/_note ignorate
      out[k] = expandDeep(v, env);
    }
    return out;
  }
  return node;
}

function asList(v) {
  if (v === undefined || v === null) return null;
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function normalizeServer(name, raw, env = process.env) {
  const r = (raw && typeof raw === 'object' ? expandDeep(raw, env) : {});
  const tools = (r.tools && typeof r.tools === 'object') ? r.tools : {};
  const timeout = Number.isFinite(Number(r.timeout)) && Number(r.timeout) > 0
    ? Number(r.timeout)
    : defaultTimeout(env);
  return {
    name: String(name),
    command: typeof r.command === 'string' ? r.command : null,
    args: Array.isArray(r.args) ? r.args.map(String) : [],
    env: (r.env && typeof r.env === 'object' && !Array.isArray(r.env)) ? { ...r.env } : {},
    cwd: typeof r.cwd === 'string' && r.cwd ? r.cwd : null,
    url: typeof r.url === 'string' && r.url ? r.url.replace(/\/+$/, '') : null,
    headers: (r.headers && typeof r.headers === 'object' && !Array.isArray(r.headers)) ? { ...r.headers } : {},
    timeout,
    enabled: r.enabled !== false,
    guilds: Array.isArray(r.guilds) && r.guilds.map(String).filter(Boolean).length
      ? [...new Set(r.guilds.map(String).filter(Boolean))]
      : null, // null = tutti i server (stile Composio: sessione senza restrizioni)
    tools: {
      include: asList(tools.include),
      exclude: asList(tools.exclude),
      resources: tools.resources !== false,
      prompts: tools.prompts !== false,
    },
  };
}

/** Env effettivo per il subprocess stdio: baseline sicura + env dichiarato. */
function stdioEnv(cfg) {
  const out = {};
  for (const k of SAFE_BASELINE_KEYS) {
    if (process.env[k] !== undefined) out[k] = process.env[k];
  }
  for (const [k, v] of Object.entries(cfg.env || {})) out[k] = String(v);
  return out;
}

function resolvePath(p) {
  try {
    if (path.isAbsolute(p)) return p;
    return path.resolve(process.cwd(), p);
  } catch {
    return p;
  }
}

/**
 * Carica e normalizza la config. Non lancia mai per file mancante/malformato:
 * ritorna `{ servers: Map, path, warnings[] }`.
 */
function loadConfig(opts = {}) {
  const env = opts.env || process.env;
  const rel = opts.path || configPath(env);
  const file = resolvePath(rel);
  const warnings = [];
  let raw = null;
  try {
    if (!fs.existsSync(file)) return { servers: new Map(), path: file, warnings };
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    warnings.push(`Config MCP illeggibile (${file}): ${(e && e.message || e).toString().split('\n')[0]}`);
    return { servers: new Map(), path: file, warnings };
  }
  const map = (raw && typeof raw === 'object' && raw.mcp_servers && typeof raw.mcp_servers === 'object')
    ? raw.mcp_servers
    : (raw && typeof raw === 'object' ? raw : {});
  const servers = new Map();
  for (const [name, entry] of Object.entries(map)) {
    if (String(name).startsWith('$') || String(name).startsWith('_')) continue;
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Server "${name}" ignorato: voce non oggetto.`);
      continue;
    }
    const cfg = normalizeServer(name, entry, env);
    if (!cfg.command && !cfg.url) {
      warnings.push(`Server "${name}" ignorato: serve "command" (stdio) o "url" (http).`);
      continue;
    }
    if (cfg.command && cfg.url) {
      warnings.push(`Server "${name}": sia command che url, uso stdio.`);
      cfg.url = null;
    }
    servers.set(cfg.name, cfg);
  }
  return { servers, path: file, warnings };
}

function clientEnabled(env = process.env) {
  return String((env && env.MCP_ENABLED) ?? '1').trim() !== '0';
}

module.exports = {
  loadConfig, normalizeServer, stdioEnv, clientEnabled,
  configPath, defaultTimeout, expandVars, DEFAULT_PATH, DEFAULT_TIMEOUT,
};
