'use strict';
/**
 * mcp/tools/index.js — registro tool: nome -> { def, run }.
 * Nuovo tool = nuovo file + una riga qui. I run restano puri orchestrazione.
 *
 * Lettura (mai scritture): guild_info, modules_list, module_status,
 * guild_snapshot, brain_search, ticket_stats, economy_top, levels_top,
 * mod_history, analytics_summary, config_get, shop_list, invites_top,
 * channels_list, roles_list.
 * Scrittura (via Commander + scope guildId, mai DB diretti): module_toggle,
 * module_reload, module_reset, module_config, announce_send (REST Bot token).
 */
const { modulesList, moduleStatus, moduleToggle } = require('./modules');
const { guildSnapshot, ticketStats, ticketsOpen } = require('./guild');
const { brainSearch, brainNoteSave, brainNoteForget } = require('./brain');
const { settingsGet, settingsSet } = require('./settings');
const { botHealth } = require('./health');
const {
  guildInfo, economyTop, levelsTop, modHistory, analyticsSummary,
  configGet, shopList, invitesTop, channelsList, rolesList,
} = require('./read');
const { moduleReload, moduleReset, moduleConfig, announceSend } = require('./write');

const REGISTRY = new Map();
for (
  const t of [
    modulesList,
    moduleStatus,
    moduleToggle,
    moduleReload,
    moduleReset,
    moduleConfig,
    announceSend,
    guildSnapshot,
    guildInfo,
    brainSearch,
    brainNoteSave,
    brainNoteForget,
    settingsGet,
    settingsSet,
    ticketStats,
    ticketsOpen,
    botHealth,
    economyTop,
    levelsTop,
    modHistory,
    analyticsSummary,
    configGet,
    shopList,
    invitesTop,
    channelsList,
    rolesList,
  ]
) {
  REGISTRY.set(t.def.name, t);
}

function listDefs() {
  return [...REGISTRY.values()].map((t) => t.def);
}

function getTool(name) {
  return REGISTRY.get(String(name)) || null;
}

module.exports = { REGISTRY, listDefs, getTool };
