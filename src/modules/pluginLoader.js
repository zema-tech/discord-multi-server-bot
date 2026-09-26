'use strict';
/**
 * modules/pluginLoader.js — carica i plugin droppabili da plugins/<nome>/.
 *
 * Manifest plugins/<nome>/plugin.json: { id, version (semver), title?,
 * description?, author?, commands: [nomi slash] }. Comandi in
 * plugins/<nome>/commands/*.js con la stessa forma dei comandi built-in
 * (export data/execute/cooldown). Mai crash: plugin non valido = warning +
 * skip. Require-safe: nessuna scansione al require, solo su chiamata.
 */

const fs = require('fs');
const path = require('path');

const ID_RE = /^[A-Za-z][A-Za-z0-9-]{1,31}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function pluginsRoot() {
  return path.resolve(__dirname, '..', '..', 'plugins');
}

/** Valida il manifest, ritorna normalizzato o lancia con motivo. */
function validateManifest(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`[${source}] plugin.json non oggetto`);
  }
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) {
    throw new Error(`[${source}] id non valido (lettera iniziale, 2-32 char a-z0-9-)`);
  }
  const version = raw.version === undefined ? '1.0.0' : String(raw.version);
  if (!SEMVER_RE.test(version)) throw new Error(`[${source}] version non semver (x.y.z)`);
  const commands = Array.isArray(raw.commands)
    ? [...new Set(raw.commands.filter((c) => typeof c === 'string' && c))]
    : [];
  return {
    id: raw.id,
    version,
    title: typeof raw.title === 'string' && raw.title ? raw.title.slice(0, 64) : raw.id,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : '',
    author: typeof raw.author === 'string' ? raw.author.slice(0, 64) : '',
    enabled: raw.enabled !== false,
    commands,
  };
}

/** Valida la forma di un comando plugin (come lo smoke test dei built-in). */
function validateCommand(mod, source) {
  if (!mod || typeof mod !== 'object') throw new Error(`[${source}] export non oggetto`);
  if (!mod.data || typeof mod.data.toJSON !== 'function') {
    throw new Error(`[${source}] manca export "data" (SlashCommandBuilder)`);
  }
  if (typeof mod.execute !== 'function') throw new Error(`[${source}] manca export "execute"`);
  let json;
  try {
    json = mod.data.toJSON();
  } catch (e) {
    throw new Error(`[${source}] data.toJSON() lancia: ${String(e && e.message || e).split('\n')[0]}`);
  }
  if (!json || typeof json.name !== 'string' || !json.name) {
    throw new Error(`[${source}] data.toJSON() senza "name" valido`);
  }
  if (typeof mod.cooldown !== 'number' || !Number.isFinite(mod.cooldown) || mod.cooldown < 0) {
    throw new Error(`[${source}] (/${json.name}) cooldown numerico mancante/non valido`);
  }
  return { mod, json };
}

/**
 * Scansiona plugins/ e ritorna { plugins: [{ manifest, dir, commands: [{name, mod}] }], disabled: [id], warnings[] }.
 * I plugin con "enabled": false vengono saltati (opt-in da plugin.json).
 * @param {{ root?: string }} opts
 */
function scanPlugins(opts = {}) {
  const root = opts.root || pluginsRoot();
  const out = { plugins: [], disabled: [], warnings: [] };
  let entries = [];
  try {
    if (!fs.existsSync(root)) return out;
    entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch (e) {
    out.warnings.push(`plugins/: lettura fallita (${String(e && e.message || e).split('\n')[0]})`);
    return out;
  }
  for (const name of entries) {
    const dir = path.join(root, name);
    const manifestFile = path.join(dir, 'plugin.json');
    if (!fs.existsSync(manifestFile)) {
      out.warnings.push(`plugins/${name}: plugin.json mancante, saltato.`);
      continue;
    }
    let manifest;
    try {
      manifest = validateManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')), `plugins/${name}`);
    } catch (e) {
      out.warnings.push(`plugins/${name}: ${String(e && e.message || e).split('\n')[0]}`);
      continue;
    }
    if (!manifest.enabled) {
      out.disabled.push(manifest.id);
      continue;
    }
    const commandsDir = path.join(dir, 'commands');
    const commands = [];
    try {
      if (fs.existsSync(commandsDir)) {
        for (const f of fs.readdirSync(commandsDir).filter((x) => x.endsWith('.js')).sort()) {
          const full = path.join(commandsDir, f);
          try {
            delete require.cache[require.resolve(full)];
            const { mod, json } = validateCommand(require(full), `plugins/${name}/${f}`);
            if (manifest.commands.length && !manifest.commands.includes(json.name)) {
              out.warnings.push(`plugins/${name}: /${json.name} non dichiarato nel manifest (caricato comunque).`);
            }
            commands.push({ name: json.name, mod });
          } catch (e) {
            out.warnings.push(`plugins/${name}/${f}: ${String(e && e.message || e).split('\n')[0]}`);
          }
        }
      }
    } catch (e) {
      out.warnings.push(`plugins/${name}/commands: ${String(e && e.message || e).split('\n')[0]}`);
    }
    out.plugins.push({ manifest, dir, commands });
  }
  return out;
}

/** Solo i comandi, piatti: [{ pluginId, name, mod }]. */
function loadPluginCommands(opts = {}) {
  const { plugins, disabled, warnings } = scanPlugins(opts);
  const commands = [];
  for (const p of plugins) {
    for (const c of p.commands) commands.push({ pluginId: p.manifest.id, name: c.name, mod: c.mod });
  }
  return { commands, plugins: plugins.map((p) => p.manifest), disabled, warnings };
}

module.exports = { scanPlugins, loadPluginCommands, validateManifest, validateCommand, pluginsRoot };
