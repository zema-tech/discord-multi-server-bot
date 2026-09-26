'use strict';
/**
 * mcp/tools/index.js — registro tool: nome -> { def, run }.
 * Nuovo tool = nuovo file + una riga qui. I run restano puri orchestrazione.
 */
const { modulesList, moduleStatus, moduleToggle } = require('./modules');
const { guildSnapshot, ticketStats } = require('./guild');
const { brainSearch } = require('./brain');

const REGISTRY = new Map();
for (const t of [modulesList, moduleStatus, moduleToggle, guildSnapshot, brainSearch, ticketStats]) {
  REGISTRY.set(t.def.name, t);
}

function listDefs() {
  return [...REGISTRY.values()].map((t) => t.def);
}

function getTool(name) {
  return REGISTRY.get(String(name)) || null;
}

module.exports = { REGISTRY, listDefs, getTool };
