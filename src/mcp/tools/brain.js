'use strict';
/**
 * mcp/tools/brain.js — ricerca nel cervello del server (sola lettura).
 */
const { textResult, toolError, ERR } = require('../protocol');

function assertGuild(tokenRec, guildId) {
  const gid = String(guildId || '');
  if (!gid) throw toolError(ERR.INVALID_PARAMS, 'guildId mancante.');
  if (gid !== tokenRec.guildId) throw toolError(ERR.FORBIDDEN_GUILD, 'Token non valido per questo server.');
  return gid;
}

const brainSearch = {
  def: {
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
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const q = String(args.query || '').slice(0, 200);
    if (!q.trim()) throw toolError(ERR.INVALID_PARAMS, 'query vuota.');
    const { buildContext, sourcesLine } = require('../../ai/brain/kernel');
    const ctx = buildContext({ guildId: gid, query: q });
    return textResult(JSON.stringify({ sources: sourcesLine(ctx.sources), excerpts: ctx.sources }));
  },
};

module.exports = { brainSearch };
