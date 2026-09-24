'use strict';
/**
 * src/modules/commander.js — Commander centrale (Fase 1).
 *
 * Il Commander è l'unico punto che esegue codice dei moduli:
 * - executeCommand: esegue un comando con timeout + recordError + breaker.
 *   Se il modulo si rompe, risponde errore senza spegnere il bot.
 * - guardEvent: wrappa ogni listener eventi: mai throw, mai crash.
 * - I moduli non si parlano mai tra loro: solo Commander -> modulo.
 *
 * Timeout default 15s (Discord scade a 3s sulle interaction, ma i comandi
 * con defer possono lavorare di più; oltre il timeout si registra errore
 * e si lascia finire il lavoro in background senza bloccare la reply).
 */

const DEFAULT_TIMEOUT_MS = 15000;

// Core Commander in TypeScript (@repo/commander, compilato in dist/).
// La logica di gate/timeout vive lì: questo file resta solo il wrapper
// Discord-facing. `dist/` è committato di proposito finché il bot non ha
// un build step (rigenera con `npm run build:commander`).
const {
  checkGate: tsCheckGate,
  executeIsolated: tsExecuteIsolated,
} = require('../../packages/commander/dist/index.js');

function getRegistry() {
  try {
    return require('./registry');
  } catch {
    return null;
  }
}

/**
 * Esegue command.execute con timeout. Non lancia mai: ritorna { ok }.
 * Registra l'errore sul registry (che fa scattare il breaker se serve).
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

  // Esecuzione isolata via core TS: timeout + onError -> recordError (breaker).
  const outcome = await tsExecuteIsolated(() => command.execute(interaction, client), {
    featureId,
    timeoutMs,
    onError: (f, err) => {
      try { registry?.recordError?.(f, guildId, err); } catch {}
    },
  });
  return outcome;
}

/**
 * Gate unificato prima dell'esecuzione: toggle + breaker.
 * Ritorna { ok:true } oppure { ok:false, reason, featureId }.
 */
function checkGate(commandName, guildId) {
  const registry = getRegistry();
  if (!registry) return { ok: true, featureId: null };
  let featureId = null;
  try {
    featureId = registry.featureOfCommand(commandName);
  } catch { featureId = null; }
  if (!featureId || !guildId) return { ok: true, featureId };
  // Gate unificato dal core TS (toggle + breaker + locked).
  try {
    return tsCheckGate({
      featureId,
      guildId,
      isLocked: (id) => registry.isLocked(id),
      isEnabled: (g, f) => registry.isEnabled(g, f),
      isIsolated: (g, f) => registry.isIsolated(g, f),
    });
  } catch {
    // Fallback: solo toggle (core mai bloccante per il bot).
    try {
      if (typeof registry.isEnabled === 'function' && !registry.isEnabled(guildId, featureId)) {
        return { ok: false, reason: 'disabled', featureId };
      }
    } catch { /* default consenti */ }
    return { ok: true, featureId };
  }
}

/**
 * Feature di un evento Discord: delega al registry (unica mappa eventi).
 * Resta qui come scorciatoia per i chiamanti del Commander.
 */
function featureOfEvent(eventName) {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.featureOfEvent === 'function') {
      return registry.featureOfEvent(eventName);
    }
  } catch { /* best-effort */ }
  return null;
}

/**
 * Feature di un componente (bottone/select/modal) dal customId.
 * Delega al registry (mappa customId, core TS). null = fail-open.
 */
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
  // guildId best-effort dal primo arg (guild / member / message / interaction).
  let guildId = null;
  try {
    const a0 = args[0];
    guildId = a0?.guildId || a0?.guild?.id || a0?.member?.guild?.id || null;
  } catch { guildId = null; }
  const featureId = featureOfEvent(eventName);
  // Se il modulo è isolato/spento, salta solo questo listener (non gli altri).
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
    return { ok: true, featureId };
  } catch (error) {
    try {
      const msg = `[commander] evento ${eventName} (${file}) isolato: ${error?.message || error}`;
      console.error(msg);
    } catch {}
    try { registry?.recordError?.(featureId, guildId, error); } catch {}
    return { ok: false, featureId, error };
  }
}

// ------------------------------------------------------------------
// Facciata orchestratore: UNICO ingresso per dashboard e /modulo verso i
// moduli (lista, salute, toggle, reload, reset protezione). La dashboard non
// richiede mai il registry diretto: così domani cambia solo il trasporto
// (in-process -> HTTP) senza riscrivere le chiamate.
// ------------------------------------------------------------------

/** Descrittori moduli (statici). [] se controller non disponibile. */
function listModules() {
  try {
    const registry = getRegistry();
    if (registry && typeof registry.list === 'function') return registry.list();
  } catch { /* default sotto */ }
  return [];
}

/** Salute moduli per guild. [] in errore (mai lanciare). */
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

/**
 * Toggle on/off per guild. Ritorna la voce salute aggiornata.
 * Riattivare azzera anche protezione ed errori (via registry).
 */
function setModuleEnabled(guildId, id, enabled) {
  const nome = assertModuleId(id);
  const registry = getRegistry();
  if (!registry || typeof registry.setEnabled !== 'function') {
    throw new Error('Controller moduli non disponibile.');
  }
  const updated = registry.setEnabled(guildId, nome, enabled === true);
  return healthEntry(guildId, nome) || updated;
}

/**
 * Reload senza restart: ricarica il descrittore (sintassi validata),
 * azzera errori E protezione breaker. Ritorna la voce salute.
 */
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
      require(modFile); // lancia se sintassi rotta
    }
    if (typeof registry.reload === 'function') registry.reload();
  } catch (e) {
    try { registry?.recordError?.(nome, guildId, e); } catch {}
    throw e;
  }
  try { registry.clearErrors?.(guildId, nome); } catch {}
  try { registry.resetBreaker?.(guildId, nome); } catch {}
  const entry = healthEntry(guildId, nome);
  if (!entry) throw new Error('modulo sparito dopo il reload');
  return entry;
}

/** Azzera errori + protezione di un modulo. Ritorna la voce salute. */
function resetModule(guildId, id) {
  const nome = assertModuleId(id);
  const registry = getRegistry();
  if (!registry) throw new Error('Controller moduli non disponibile.');
  try { registry.clearErrors?.(guildId, nome); } catch {}
  try { registry.resetBreaker?.(guildId, nome); } catch {}
  return healthEntry(guildId, nome);
}

module.exports = {
  executeCommand,
  checkGate,
  guardEvent,
  featureOfEvent,
  featureOfComponent,
  // Facciata orchestratore: unico ingresso per dashboard e /modulo.
  listModules,
  moduleHealth,
  setModuleEnabled,
  reloadModule,
  resetModule,
  DEFAULT_TIMEOUT_MS,
};
