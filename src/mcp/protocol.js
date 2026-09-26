'use strict';
/**
 * mcp/protocol.js — JSON-RPC 2.0 per MCP Streamable HTTP (spec 2025-06-18).
 * Helper puri: costruzione risposte/errori, niente I/O.
 */

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'discord-multi-server-bot', version: '1.0.0' };

// Errori standard JSON-RPC + MCP applicativi.
const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32000,
  UNAUTHORIZED: -32001, // token mancante/non valido
  FORBIDDEN_GUILD: -32002, // guild diversa dal token
};

function ok(id, result) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, result };
}

function fail(id, code, message, data) {
  const error = { code, message: String(message || 'Errore.') };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error };
}

function textResult(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

/** Errore applicativo con code MCP (per i tool). */
function toolError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Valida envelope JSON-RPC. Ritorna { id, method, params } o lancia INVALID_REQUEST. */
function parseEnvelope(body) {
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    throw toolError(ERR.INVALID_REQUEST, 'Richiesta JSON-RPC non valida.');
  }
  return {
    id: body.id !== undefined ? body.id : null,
    method: body.method,
    params: body.params && typeof body.params === 'object' ? body.params : {},
  };
}

module.exports = { PROTOCOL_VERSION, SERVER_INFO, ERR, ok, fail, textResult, toolError, parseEnvelope };
