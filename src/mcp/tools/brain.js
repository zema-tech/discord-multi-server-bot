'use strict';
/**
 * mcp/tools/brain.js — ricerca nel cervello del server (sola lettura).
 */
const { assertGuild, textResult, toolError, ERR } = require('./scope');

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

const brainNoteSave = {
  def: {
    name: 'brain_note_save',
    description: 'Salva una nota nel cervello del server (usa [[Link]] e #tag). Il token è owner: equivale allo staff.',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        title: { type: 'string', description: 'Titolo (2-60 char)' },
        text: { type: 'string', description: 'Contenuto (max 2000)' },
        tags: { type: 'string', description: 'Tag separati da virgola (opzionale)' },
      },
      required: ['guildId', 'title', 'text'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const memory = require('../../ai/brain/memory');
    const title = memory.saveNote(
      gid,
      String(args.title || ''),
      String(args.text || ''),
      String(args.tags || '')
    );
    return textResult(JSON.stringify({ ok: true, title }));
  },
};

const brainNoteForget = {
  def: {
    name: 'brain_note_forget',
    description: 'Elimina una nota dal cervello del server.',
    inputSchema: {
      type: 'object',
      properties: {
        guildId: { type: 'string' },
        title: { type: 'string', description: 'Titolo esatto' },
      },
      required: ['guildId', 'title'], additionalProperties: false,
    },
  },
  async run(args, token) {
    const gid = assertGuild(token, args.guildId);
    const memory = require('../../ai/brain/memory');
    const ok = memory.deleteNote(gid, String(args.title || ''));
    if (!ok) throw toolError(ERR.INVALID_PARAMS, 'Nota non trovata.');
    return textResult(JSON.stringify({ ok: true }));
  },
};

module.exports = { brainSearch, brainNoteSave, brainNoteForget };
