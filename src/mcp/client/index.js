'use strict';
/**
 * mcp/client/index.js — singleton client MCP direzione B.
 * Lazy: nessuna connessione al require, solo su ensureStarted()/reload().
 * Con MCP_ENABLED=0 o senza mcp/servers.json resta inerte (0 tool).
 * Lo scope guild (stile Composio) passa per opts.guildId: i tool dei server
 * con `guilds: [...]` sono visibili/chiamabili solo lì.
 */

const { McpManager } = require('./manager');

let manager = null;

function getManager(opts = {}) {
  if (!manager || opts.fresh) manager = new McpManager(opts);
  return manager;
}

async function ensureStarted(opts = {}) {
  const m = getManager(opts);
  if (!m.started) await m.discover();
  return m;
}

async function listTools(opts = {}) {
  const m = await ensureStarted(opts);
  return m.listDefs(opts.guildId || null);
}

async function callTool(name, args, opts = {}) {
  const m = await ensureStarted(opts);
  return m.callTool(name, args, opts.guildId || null);
}

async function searchTools(query, opts = {}) {
  const m = await ensureStarted(opts);
  return m.searchTools(query, opts.guildId || null);
}

async function status(opts = {}) {
  const m = await ensureStarted(opts);
  return m.summary();
}

async function reload(opts = {}) {
  const m = getManager(opts);
  return m.reload();
}

module.exports = { getManager, ensureStarted, listTools, callTool, searchTools, status, reload, McpManager };
