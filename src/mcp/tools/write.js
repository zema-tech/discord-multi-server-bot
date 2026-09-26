'use strict';
/**
 * mcp/tools/write.js — tool MCP di SCRITTURA (telecomando: agisce sul bot).
 *
 * Regole ferree:
 * 1. OGNI scrittura passa dal Commander (stesso gate di dashboard e /modulo),
 *    mai DB diretti — tranne `announce_send` che usa le REST con Bot token.
 * 2. OGNI scrittura richiede `guildId` = server del token (scope).
 * 3. `module_config`: patch oggetto, max 20 chiavi, valori piccoli, niente
 *    chiavi prototipo. I moduli validi sono quelli del Commander.
 * 4. `announce_send`: canale testuale DEL server (verificato in lista live),
 *    max 2000 char, @everyone/@here neutralizzati.
 */

const { assertGuild, textResult, toolError, ERR } = require('./scope');

function commander() {
  return require('../../modules/commander');
}

/** Modulo Commander dal tool: id valido + voce salute aggiornata. */
function commanderWrite(fn, args, token) {
  const gid = assertGuild(token, args.guildId);
  const c = commander();
  const modId = String(args.moduleId || '').toLowerCase().trim();
  if (!modId) throw toolError(ERR.INVALID_PARAMS, 'moduleId mancante.');
  try {
    return fn(c, gid, modId);
  } catch (e) {
    const msg = String((e && e.message) || 'Operazione fallita.');
    const code = e && e.status === 400 ? ERR.INVALID_PARAMS : ERR.INTERNAL;
    throw toolError(code, msg.slice(0, 300));
  }
}

const moduleReload = {
  def: {
    name: 'module_reload',
    description: 'Ricarica un modulo senza restart: azzera errori e protezione breaker.',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        moduleId: { type: 'string', description: 'ID modulo (da modules_list)' },
      },
      required: ['guildId', 'moduleId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const entry = commanderWrite((c, gid, modId) => c.reloadModule(gid, modId), args, token);
    return textResult(JSON.stringify({ id: entry.id, enabled: entry.enabled, isolated: entry.isolated, ok: entry.ok }));
  },
};

const moduleReset = {
  def: {
    name: 'module_reset',
    description: 'Azzera errori e protezione di un modulo (senza ricaricarlo).',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        moduleId: { type: 'string', description: 'ID modulo (da modules_list)' },
      },
      required: ['guildId', 'moduleId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const entry = commanderWrite((c, gid, modId) => c.resetModule(gid, modId), args, token);
    return textResult(JSON.stringify({ id: entry.id, enabled: entry.enabled, isolated: entry.isolated, ok: entry.ok }));
  },
};

const CONFIG_MODS = ['general', 'welcome', 'logging', 'levels', 'automod', 'autorole', 'starboard', 'confessioni', 'tickets', 'tempvoice', 'ai'];

function cleanPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw toolError(ERR.INVALID_PARAMS, 'patch deve essere un oggetto.');
  }
  const keys = Object.keys(patch);
  if (!keys.length) throw toolError(ERR.INVALID_PARAMS, 'patch vuota.');
  if (keys.length > 20) throw toolError(ERR.INVALID_PARAMS, 'patch troppo grande (max 20 chiavi).');
  const out = {};
  for (const k of keys) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      throw toolError(ERR.INVALID_PARAMS, `Chiave non consentita: ${k}.`);
    }
    let v;
    try {
      v = JSON.parse(JSON.stringify(patch[k]));
    } catch {
      throw toolError(ERR.INVALID_PARAMS, `Valore non JSON per: ${k}.`);
    }
    if (JSON.stringify(v).length > 2048) {
      throw toolError(ERR.INVALID_PARAMS, `Valore troppo grande per: ${k} (max 2KB).`);
    }
    out[k] = v;
  }
  return out;
}

const moduleConfig = {
  def: {
    name: 'module_config',
    description: `Cambia la config di un modulo via Commander (${CONFIG_MODS.join(', ')}). Leggi prima con config_get.`,
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        moduleId: { type: 'string', description: 'Modulo da configurare' },
        patch: { type: 'object', description: 'Chiavi da cambiare (max 20)' },
      },
      required: ['guildId', 'moduleId', 'patch'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const modId = String(args.moduleId || '').toLowerCase().trim();
    if (!CONFIG_MODS.includes(modId)) {
      throw toolError(ERR.INVALID_PARAMS, `Modulo non configurabile: ${modId || '?'} (${CONFIG_MODS.join(', ')}).`);
    }
    const patch = cleanPatch(args.patch);
    try {
      const updated = commander().updateModuleConfig(gid, modId, patch);
      return textResult(JSON.stringify({ module: modId, ok: true, config: updated }));
    } catch (e) {
      const msg = String((e && e.message) || 'Config fallita.');
      const code = e && e.status === 400 ? ERR.INVALID_PARAMS : ERR.INTERNAL;
      throw toolError(code, msg.slice(0, 300));
    }
  },
};

const announceSend = {
  def: {
    name: 'announce_send',
    description: 'Invia un messaggio in un canale testuale del server (max 2000 char, senza @everyone/@here).',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        channelId: { type: 'string', description: 'ID canale (da channels_list)' },
        text: { type: 'string', description: 'Testo, max 2000 caratteri' },
      },
      required: ['guildId', 'channelId', 'text'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const channelId = String(args.channelId || '').trim();
    if (!channelId) throw toolError(ERR.INVALID_PARAMS, 'channelId mancante.');
    let text = String(args.text || '').trim();
    if (!text) throw toolError(ERR.INVALID_PARAMS, 'Testo vuoto.');
    if (text.length > 2000) throw toolError(ERR.INVALID_PARAMS, 'Testo troppo lungo (max 2000).');
    text = text.replace(/@everyone/g, 'everyone').replace(/@here/g, 'here');
    const rest = require('../../dashboard/discordRest');
    let channels;
    try {
      channels = await rest.getChannels(gid);
    } catch (e) {
      throw toolError(ERR.INTERNAL, e.message || 'Lettura canali fallita.');
    }
    const ch = channels.find((c) => c.id === channelId);
    if (!ch) throw toolError(ERR.FORBIDDEN_GUILD, 'Canale non di questo server.');
    if (ch.type !== 0 && ch.type !== 5) {
      throw toolError(ERR.INVALID_PARAMS, `Canale non testuale (tipo ${ch.type}).`);
    }
    try {
      const sent = await rest.sendMessage(channelId, text);
      return textResult(JSON.stringify({ ok: true, messageId: sent.id, channel: ch.name }));
    } catch (e) {
      throw toolError(ERR.INTERNAL, String((e && e.message) || 'Invio fallito.').slice(0, 300));
    }
  },
};

module.exports = { moduleReload, moduleReset, moduleConfig, announceSend, CONFIG_MODS };
