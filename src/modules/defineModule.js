'use strict';
/**
 * src/modules/defineModule.js — contratto dei moduli stile Lumi DefineModule.
 *
 * Ogni file in src/modules/ descrive una feature; questo validatore ne impone
 * la forma prima della registrazione: id univoco e ben formato, comandi come
 * stringhe, versione semver. Il registry scarta (con motivo loggato) i file
 * che non rispettano il contratto invece di registrarli a metà.
 */

const ID_RE = /^[A-Za-z][A-Za-z0-9-]{1,31}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function strList(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
}

/**
 * Valida e normalizza un descrittore. Ritorna il descrittore normalizzato,
 * lancia Error con motivo in caso contrario.
 */
function defineModule(mod, source = 'sconosciuto') {
  if (!mod || typeof mod !== 'object') throw new Error(`[${source}] descrittore non oggetto`);
  if (typeof mod.id !== 'string' || !ID_RE.test(mod.id)) {
    throw new Error(`[${source}] id non valido (lettere, numeri, trattini, 2-32 char)`);
  }
  const version = mod.version === undefined ? '1.0.0' : String(mod.version);
  if (!SEMVER_RE.test(version)) throw new Error(`[${source}] version non semver (x.y.z)`);
  return {
    id: mod.id,
    version,
    title: typeof mod.title === 'string' && mod.title ? mod.title.slice(0, 64) : mod.id,
    icon: typeof mod.icon === 'string' && mod.icon ? mod.icon.slice(0, 32) : 'grid',
    section: typeof mod.section === 'string' && mod.section ? mod.section.slice(0, 32) : 'Altro',
    description: typeof mod.description === 'string' ? mod.description.slice(0, 500) : '',
    commands: [...new Set(strList(mod.commands))],
    db: [...new Set(strList(mod.db))],
    events: [...new Set(strList(mod.events))],
    handlers: [...new Set(strList(mod.handlers))],
    locked: mod.locked === true,
    statsExtra: typeof mod.statsExtra === 'function' ? mod.statsExtra : null,
  };
}

module.exports = { defineModule, ID_RE, SEMVER_RE };
