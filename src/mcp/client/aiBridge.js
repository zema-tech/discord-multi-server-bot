'use strict';
/**
 * mcp/client/aiBridge.js — ponte fra tool MCP esterni e AI del bot.
 *
 * La AI nativa (`src/ai/ai.js`) resta testuale; questo bridge espone i tool
 * MCP come function-specs OpenAI-compatibili + un runner che formatta il
 * risultato per il passo successivo. Usato da /mcp e dai futuri agent-loop.
 */

function functionSpecs(manager) {
  try {
    if (!manager || typeof manager.toOpenAIFunctions !== 'function') return [];
    return manager.toOpenAIFunctions();
  } catch {
    return [];
  }
}

/** Prompt-system che descrive i tool disponibili (cap 1500 char, come SYSTEM_MAX_CHARS). */
function toolsSystemPrompt(manager, maxChars = 1500) {
  const specs = functionSpecs(manager);
  if (!specs.length) return '';
  const lines = specs.slice(0, 30).map((s) => `- ${s.name}: ${String(s.description || '').slice(0, 120)}`);
  const txt = `Tool MCP disponibili (chiamali con /mcp chiama nome:... argomenti:...):\n${lines.join('\n')}`;
  return txt.slice(0, maxChars);
}

async function runTool(manager, name, args) {
  const parsed = typeof args === 'string'
    ? (() => { try { return JSON.parse(args); } catch { return { _text: args }; } })()
    : (args || {});
  const out = await manager.callTool(name, parsed);
  return out.text || JSON.stringify(out.result).slice(0, 2000);
}

module.exports = { functionSpecs, toolsSystemPrompt, runTool };
