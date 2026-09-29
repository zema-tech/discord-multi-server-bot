'use strict';
/**
 * mcp/tools/settings.js — impostazioni runtime NON segrete (/config senza chiavi API).
 *
 * Il token MCP è owner-created, ma le chiavi API non transitano mai qui:
 * solo AI_PROVIDER, AI_MODEL, AI_API_URL, AI_DAILY_LIMIT, LOG_LEVEL.
 * Effetto immediato, senza restart (stesso overlay di /config).
 */
const { textResult, toolError, ERR } = require('../protocol');

const ALLOWED = ['AI_PROVIDER', 'AI_MODEL', 'AI_API_URL', 'AI_DAILY_LIMIT', 'LOG_LEVEL'];

function assertGuild(tokenRec, guildId) {
  // Le impostazioni sono globali al processo, ma il tool resta scoped al
  // server del token (niente cross-guild anche qui).
  const gid = String(guildId || '');
  if (!gid) throw toolError(ERR.INVALID_PARAMS, 'guildId mancante.');
  if (gid !== tokenRec.guildId) throw toolError(ERR.FORBIDDEN_GUILD, 'Token non valido per questo server.');
  return gid;
}

const settingsGet = {
  def: {
    name: 'settings_get',
    description: 'Legge le impostazioni runtime non segrete (provider IA, limiti, log).',
    inputSchema: {
      type: 'object',
      properties: { guildId: { type: 'string' } },
      required: ['guildId'], additionalProperties: false,
    },
  },
  async run(args, token) {
    assertGuild(token, args.guildId);
    const settings = require('../../database/settings');
    const env = settings.effectiveEnv();
    const out = {};
    for (const k of ALLOWED) out[k] = env[k] ?? null;
    return textResult(JSON.stringify(out));
  },
};

const settingsSet = {
  def: {
    name: 'settings_set',
    description: 'Cambia un\u2019impostazione runtime (AI_PROVIDER, AI_MODEL, AI_API_URL, AI_DAILY_LIMIT, LOG_LEVEL). Mai chiavi API.',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        key: { type: 'string', description: 'Una di: AI_PROVIDER, AI_MODEL, AI_API_URL, AI_DAILY_LIMIT, LOG_LEVEL' },
        value: { type: 'string', description: 'Nuovo valore' },
      },
      required: ['guildId', 'key', 'value'], additionalProperties: false,
    },
  },
  async run(args, token) {
    assertGuild(token, args.guildId);
    const key = String(args.key || '').toUpperCase().trim();
    if (!ALLOWED.includes(key)) {
      throw toolError(ERR.INVALID_PARAMS, `Chiave non modificabile via MCP (${ALLOWED.join(', ')}). Le chiavi API si impostano da Discord con /config (owner).`);
    }
    const settings = require('../../database/settings');
    const saved = settings.setOverride(key, String(args.value ?? ''));
    return textResult(JSON.stringify({ ok: true, key: saved.key, value: saved.value }));
  },
};

module.exports = { settingsGet, settingsSet };
