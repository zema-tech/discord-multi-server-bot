'use strict';
/**
 * mcp/tools/modules.js — tool moduli via Commander (orchestratore, mai DB diretti).
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

const modulesList = {
  def: {
    name: 'modules_list',
    description: 'Elenca i moduli del bot (id, titolo, versione, comandi).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  async run(_args, _token) {
    const c = commander();
    return textResult(JSON.stringify(c.listModules().map((m) => ({
      id: m.id, title: m.title, version: m.version, commands: m.commands,
    }))));
  },
};

const moduleStatus = {
  def: {
    name: 'module_status',
    description: 'Salute dei moduli in un server: on/off, protezione, errori.',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string', description: 'ID server (deve matchare il token)' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const c = commander();
    return textResult(JSON.stringify(c.moduleHealth(gid).map((m) => ({
      id: m.id, enabled: m.enabled, isolated: m.isolated, ok: m.ok,
      errors: (m.errors || []).length,
    }))));
  },
};

const moduleToggle = {
  def: {
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
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    if (typeof args.enabled !== 'boolean') throw toolError(ERR.INVALID_PARAMS, 'enabled deve essere boolean.');
    const c = commander();
    const entry = c.setModuleEnabled(gid, args.moduleId, args.enabled);
    return textResult(JSON.stringify({ id: entry?.id || args.moduleId, enabled: entry?.enabled ?? args.enabled }));
  },
};

module.exports = { modulesList, moduleStatus, moduleToggle };
