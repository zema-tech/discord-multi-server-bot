'use strict';
/**
 * src/modules/commander.js — Commander centrale (cervello).
 *
 * Il Commander è l'unico punto che esegue codice dei moduli (muscoli):
 * - executeCommand: timeout + recordError + breaker + Guardian.observe
 * - guardEvent: wrappa listener eventi
 * - Guardian (sistema immunitario INTERNO): score salute per guild:feature
 *
 * I moduli non si parlano mai tra loro: solo Commander -> modulo.
 */

const DEFAULT_TIMEOUT_MS = 15000;

// Core Commander in TypeScript (@repo/commander, compilato in dist/).
const {
  checkGate: tsCheckGate,
  executeIsolated: tsExecuteIsolated,
  guardian: tsGuardian,
} = require('../../packages/commander/dist/index.js');

function getRegistry() {
  try {
    return require('./registry');
  } catch {
    return null;
  }
}

function observeGuardian(partial) {
  try {
    if (tsGuardian && typeof tsGuardian.observe === 'function') {
      return tsGuardian.observe(partial);
    }
  } catch { /* immune mai bloccante */ }
  return null;
}

function errMessage(error) {
  try {
    return String((error && error.message) || error || 'error').slice(0, 200);
  } catch {
    return 'error';
  }
}

/**
 * Esegue command.execute con timeout. Non lancia mai: ritorna { ok }.
 * Registra l'errore sul registry (breaker) e sul Guardian (score).
 */
async function executeCommand(command, interaction, client, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
    ? opts.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  const registry = getRegistry();
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  let featureId = null;
  try {
    if (registry && typeof registry.featureOfCommand === 'function') {
      featureId = registry.featureOfCommand(command?.data?.name || interaction?.commandName);
    }
  } catch { featureId = null; }

  const outcome = await tsExecuteIsolated(() => command.execute(interaction, client), {
    featureId,
    timeoutMs,
    onError: (f, err) => {
      try { registry?.recordError?.(f, guildId, err); } catch {}
    },
  });

  observeGuardian({
    guildId,
    featureId,
    ok: !!(outcome && outcome.ok),
    timedOut: !!(outcome && outcome.timedOut),
    source: 'command',
    errMessage: outcome && outcome.error ? errMessage(outcome.error) : undefined,
  });

  return outcome;
}

function canRun(guildId, featureId) {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.canRun === 'function') {
      return registry.canRun(guildId, featureId);
    }
  } catch { /* default sotto */ }
  return { ok: true, featureId };
}

function checkGate(commandName, guildId) {
  const registry = getRegistry();
  if (!registry) return { ok: true, featureId: null };
  let featureId = null;
  try {
    featureId = registry.featureOfCommand(commandName);
  } catch { featureId = null; }
  if (!featureId || !guildId) return { ok: true, featureId };
  try {
    return tsCheckGate({
      featureId,
      guildId,
      isLocked: (id) => registry.isLocked(id),
      isEnabled: (g, f) => registry.isEnabled(g, f),
      isIsolated: (g, f) => registry.isIsolated(g, f),
    });
  } catch {
    try {
      if (typeof registry.isEnabled === 'function' && !registry.isEnabled(guildId, featureId)) {
        return { ok: false, reason: 'disabled', featureId };
      }
    } catch { /* default consenti */ }
    return { ok: true, featureId };
  }
}

function featureOfEvent(eventName) {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.featureOfEvent === 'function') {
      return registry.featureOfEvent(eventName);
    }
  } catch { /* best-effort */ }
  return null;
}

function featureOfComponent(customId) {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.featureOfComponent === 'function') {
      return registry.featureOfComponent(customId);
    }
  } catch { /* best-effort */ }
  return null;
}

async function guardEvent(file, event, args, client) {
  const registry = getRegistry();
  const eventName = event?.name || 'sconosciuto';
  let guildId = null;
  try {
    const a0 = args[0];
    guildId = a0?.guildId || a0?.guild?.id || a0?.member?.guild?.id || null;
  } catch { guildId = null; }
  const featureId = featureOfEvent(eventName);
  if (guildId && featureId) {
    try {
      if (typeof registry?.canRun === 'function') {
        const r = registry.canRun(guildId, featureId);
        if (r && r.ok === false) return { ok: false, skipped: true, reason: r.reason, featureId };
      }
    } catch { /* default esegui */ }
  }
  try {
    await event.execute(...args, client);
    observeGuardian({ guildId, featureId, ok: true, source: 'event' });
    return { ok: true, featureId };
  } catch (error) {
    try {
      const msg = `[commander] evento ${eventName} (${file}) isolato: ${error?.message || error}`;
      console.error(msg);
    } catch {}
    try { registry?.recordError?.(featureId, guildId, error); } catch {}
    observeGuardian({
      guildId,
      featureId,
      ok: false,
      source: 'event',
      errMessage: errMessage(error),
    });
    return { ok: false, featureId, error };
  }
}

function listModules() {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.list === 'function') return registry.list();
  } catch { /* default sotto */ }
  return [];
}

function moduleHealth(guildId) {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.health === 'function') {
      const h = registry.health(guildId);
      return Array.isArray(h) ? h : [];
    }
  } catch { /* default sotto */ }
  return [];
}

function healthEntry(guildId, id) {
  try {
    return (moduleHealth(guildId) || []).find((h) => h && h.id === id) || null;
  } catch { return null; }
}

/** Riepilogo sistema immunitario (Guardian) per una guild. */
function guardianSummary(guildId) {
  try {
    if (tsGuardian && typeof tsGuardian.summary === 'function') {
      return tsGuardian.summary(guildId);
    }
  } catch { /* default sotto */ }
  return { guildId: guildId || 'dm', features: [], critical: 0, weak: 0, ok: 0 };
}

function assertModuleId(id) {
  const nome = String(id || '').toLowerCase().trim();
  if (!nome) throw new Error('ID modulo mancante.');
  const registry = getRegistry();
  let ids = [];
  try {
    ids = typeof registry?.ids === 'function' ? registry.ids() : [];
  } catch { ids = []; }
  if (!ids.includes(nome)) throw new Error(`Modulo sconosciuto \`${nome}\`.`);
  return nome;
}

function setModuleEnabled(guildId, id, enabled) {
  const nome = assertModuleId(id);
  const registry = getRegistry();
  if (!registry || typeof registry.setEnabled !== 'function') {
    throw new Error('Controller moduli non disponibile.');
  }
  const updated = registry.setEnabled(guildId, nome, enabled === true);
  return healthEntry(guildId, nome) || updated;
}

function reloadModule(guildId, id) {
  const nome = assertModuleId(id);
  const registry = getRegistry();
  if (!registry) throw new Error('Controller moduli non disponibile.');
  try {
    const path = require('path');
    const fs = require('fs');
    const modFile = path.join(__dirname, `${nome}.js`);
    if (fs.existsSync(modFile)) {
      delete require.cache[require.resolve(modFile)];
      require(modFile);
    }
    if (typeof registry.reload === 'function') registry.reload();
  } catch (e) {
    try { registry?.recordError?.(nome, guildId, e); } catch {}
    throw e;
  }
  try { registry.clearErrors?.(guildId, nome); } catch {}
  try { registry.resetBreaker?.(guildId, nome); } catch {}
  try { tsGuardian?.reset?.(guildId, nome); } catch {}
  const entry = healthEntry(guildId, nome);
  if (!entry) throw new Error('modulo sparito dopo il reload');
  return entry;
}

function resetModule(guildId, id) {
  const nome = assertModuleId(id);
  const registry = getRegistry();
  if (!registry) throw new Error('Controller moduli non disponibile.');
  try { registry.clearErrors?.(guildId, nome); } catch {}
  try { registry.resetBreaker?.(guildId, nome); } catch {}
  try { tsGuardian?.reset?.(guildId, nome); } catch {}
  return healthEntry(guildId, nome);
}

function dispatchError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function needDb(rel, status, message) {
  let mod = null;
  try {
    mod = require(rel);
  } catch { mod = null; }
  if (!mod) throw dispatchError(status, message);
  return mod;
}

function updateModuleConfig(guildId, mod, patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  switch (mod) {
    case 'general': {
      const guildConfig = needDb('../database/guildConfig', 500, 'Modulo guildConfig non disponibile.');
      const { language, logChannelId, suggestChannelId, levelupChannelId, levelupEnabled } = p;
      const q = {};
      if (language !== undefined) q.language = language;
      if (logChannelId !== undefined) q.logChannelId = logChannelId;
      if (suggestChannelId !== undefined) q.suggestChannelId = suggestChannelId;
      if (levelupChannelId !== undefined) q.levelupChannelId = levelupChannelId;
      if (levelupEnabled !== undefined) q.levelupEnabled = levelupEnabled;
      return guildConfig.updateGuild(guildId, q);
    }
    case 'welcome':
    case 'logging':
    case 'levels': {
      const guildConfig = needDb('../database/guildConfig', 500, 'Modulo guildConfig non disponibile.');
      const q = { ...p };
      for (const k of ['welcomeStyle', 'goodbyeStyle']) {
        if (q[k] !== undefined && q[k] !== 'embed' && q[k] !== 'text') {
          throw dispatchError(400, `${k} deve essere "embed" o "text".`);
        }
      }
      for (const k of ['welcomeColor', 'goodbyeColor']) {
        if (q[k] !== undefined && (typeof q[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(q[k]))) {
          throw dispatchError(400, `${k} deve essere un colore hex (#rrggbb).`);
        }
      }
      return guildConfig.updateGuild(guildId, q);
    }
    case 'automod': {
      const guildConfig = needDb('../database/guildConfig', 500, 'Modulo guildConfig non disponibile.');
      const q = { ...p };
      if (typeof q.badWords === 'string') {
        q.badWords = q.badWords.split(/[,;\n]+/).map((w) => w.trim().toLowerCase())
          .filter(Boolean).slice(0, 50).map((w) => w.slice(0, 30));
      }
      return guildConfig.updateGuild(guildId, { automod: q });
    }
    case 'autorole': {
      const autorole = needDb('../database/autorole', 501, 'Modulo autorole non ancora disponibile.');
      return autorole.setConfig(guildId, p);
    }
    case 'starboard': {
      const starboard = needDb('../database/starboard', 501, 'Modulo starboard non ancora disponibile.');
      return starboard.setStarboard(guildId, p);
    }
    case 'confessioni': {
      const confessioni = needDb('../database/confessioni', 501, 'Modulo confessioni non ancora disponibile.');
      if (p.channelId === null) return confessioni.disableConfessioni(guildId);
      return confessioni.setCanale(guildId, p.channelId);
    }
    case 'tickets': {
      const tickets = needDb('../database/tickets', 500, 'Modulo tickets non disponibile.');
      return tickets.setConfig(guildId, p);
    }
    case 'tempvoice': {
      const tempvoice = needDb('../database/tempvoice', 501, 'Modulo tempvoice non ancora disponibile.');
      return tempvoice.setConfig(guildId, p);
    }
    case 'ai': {
      const aiConfig = needDb('../database/aiConfig', 501, 'Modulo AI non ancora disponibile.');
      if (typeof aiConfig.setConfig === 'function') return aiConfig.setConfig(guildId, p);
      if (typeof aiConfig.updateConfig === 'function') return aiConfig.updateConfig(guildId, p);
      throw dispatchError(501, 'Modulo AI senza API di scrittura.');
    }
    case 'economy': {
      const economy = needDb('../database/economy', 500, 'Modulo economy non disponibile.');
      if (typeof economy.setTuning !== 'function') throw dispatchError(501, 'Tuning economy non disponibile.');
      return { tuning: economy.setTuning(guildId, p) };
    }
    case 'music': {
      const music = needDb('../database/music', 501, 'Modulo musica non ancora disponibile.');
      return music.setConfig(guildId, p);
    }
    case 'birthdays': {
      const birthdays = needDb('../database/birthdays', 501, 'Modulo compleanni non ancora disponibile.');
      if (p.channelId === undefined) throw dispatchError(400, 'channelId mancante.');
      return { channelId: birthdays.setChannel(guildId, p.channelId) };
    }
    case 'statchannels': {
      const sc = needDb('../database/statChannels', 501, 'Modulo canali statistiche non disponibile.');
      const cur = (sc.get && sc.get(guildId)) || {};
      const q = { membersId: cur.membersId || null, onlineId: cur.onlineId || null, botsId: cur.botsId || null };
      for (const k of ['membersId', 'onlineId', 'botsId']) {
        if (p[k] !== undefined) q[k] = p[k];
      }
      return sc.set(guildId, q);
    }
    default:
      throw dispatchError(400, `Modulo sconosciuto: ${mod}.`);
  }
}

module.exports = {
  executeCommand,
  checkGate,
  canRun,
  guardEvent,
  featureOfEvent,
  featureOfComponent,
  listModules,
  moduleHealth,
  setModuleEnabled,
  reloadModule,
  resetModule,
  updateModuleConfig,
  guardianSummary,
  DEFAULT_TIMEOUT_MS,
};
