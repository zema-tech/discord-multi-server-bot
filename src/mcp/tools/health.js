'use strict';
/**
 * mcp/tools/health.js — salute del processo (uptime, modalità, backend).
 * Il client Discord è opzionale: senza, i campi live sono null (degradata
 * onesta invece di numeri inventati).
 */
const { textResult, toolError, ERR } = require('../protocol');

let liveClient = null;

function setClient(client) {
  liveClient = client || null;
}

function guildCount() {
  try {
    const c = liveClient;
    if (c && c.guilds && c.guilds.cache && typeof c.guilds.cache.size === 'number') {
      return c.guilds.cache.size;
    }
  } catch {}
  return null;
}

function commandCount() {
  try {
    const c = liveClient;
    if (c && typeof c.commands?.size === 'number') return c.commands.size;
  } catch {}
  return null;
}

const botHealth = {
  def: {
    name: 'bot_health',
    description: 'Salute del bot: uptime, modalità, guild, comandi, backend DB.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  async run(_args, _token) {
    let backend = 'json';
    try {
      const store = require('../../database/store');
      if (store && typeof store.backend === 'function') backend = store.backend();
    } catch {}
    let features = 0;
    try {
      const c = require('../../modules/commander');
      features = c.listModules().length;
    } catch {}
    return textResult(JSON.stringify({
      uptimeSec: Math.floor(process.uptime()),
      mode: liveClient ? 'embedded' : 'standalone',
      guilds: guildCount(),
      commands: commandCount(),
      features,
      backend,
      time: new Date().toISOString(),
    }));
  },
};

module.exports = { botHealth, setClient };
