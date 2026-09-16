'use strict';
/**
 * scripts/smoke-test.js — QA smoke test (CommonJS, Node 24).
 *
 * Scansione DINAMICA (resiste a file aggiunti da altri agenti):
 *  (a) require di TUTTI i file in src/commands (ricorsivo): export data/execute,
 *      data.toJSON() valido, nomi slash unici, cooldown numerico.
 *  (b) verifica tutti gli eventi in src/events: export name/execute.
 *  (c) testa i moduli database con chiavi `qatest` e poi PULISCE le chiavi
 *      di test dai JSON (ripristina i file come prima).
 *  (d) esce 0 se tutto ok, 1 con elenco errori altrimenti.
 *  (e) extra QA: customId letterali duplicati, nomi evento duplicati.
 *
 * Uso: node scripts/smoke-test.js
 * Non avvia il bot, non richiede DISCORD_TOKEN, non esegue command.execute().
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'src', 'commands');
const EVENTS_DIR = path.join(ROOT, 'src', 'events');
const DB_DIR = path.join(ROOT, 'src', 'database');

const errors = [];
const warnings = [];
let commandFiles = [];
let eventFiles = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

/** Raccoglie ricorsivamente tutti i .js sotto dir (ordinati). */
function collectJs(dir, recursive) {
  const out = [];
  if (!fs.existsSync(dir)) {
    fail(`Directory mancante: ${path.relative(ROOT, dir)}`);
    return out;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...collectJs(full, true));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p);
}

// ---------------------------------------------------------------- (a) COMANDI
console.log('== [1/4] Comandi ==');
commandFiles = collectJs(COMMANDS_DIR, true);
console.log(`File comando trovati: ${commandFiles.length}`);

const seenNames = new Map(); // slashName -> file
const nameRe = /^[\p{Ll}\p{N}_-]+$/u; // nomi slash: minuscoli, numeri, _/-

for (const file of commandFiles) {
  const r = rel(file);
  let mod;
  try {
    delete require.cache[require.resolve(file)];
    mod = require(file);
  } catch (e) {
    fail(`${r}: require fallito (sintassi/export?): ${e.message.split('\n')[0]}`);
    continue;
  }
  if (!mod || typeof mod !== 'object') {
    fail(`${r}: export non è un oggetto`);
    continue;
  }
  if (!mod.data) fail(`${r}: manca export "data" (SlashCommandBuilder)`);
  if (typeof mod.execute !== 'function') fail(`${r}: manca export "execute" (function)`);
  if (!mod.data || typeof mod.data.toJSON !== 'function') {
    fail(`${r}: data.toJSON() non disponibile`);
    continue;
  }
  let json;
  try {
    json = mod.data.toJSON();
  } catch (e) {
    fail(`${r}: data.toJSON() lancia: ${e.message.split('\n')[0]}`);
    continue;
  }
  if (!json || typeof json.name !== 'string' || !json.name) {
    fail(`${r}: data.toJSON() senza "name" valido`);
    continue;
  }
  if (!nameRe.test(json.name)) {
    fail(`${r}: nome slash "${json.name}" non valido (solo minuscoli/numeri/_/-)`);
  }
  if (!json.description) {
    fail(`${r} (/${json.name}): descrizione mancante`);
  }
  if (seenNames.has(json.name)) {
    fail(`Nome comando duplicato "/${json.name}": ${rel(seenNames.get(json.name))} <-> ${r}`);
  } else {
    seenNames.set(json.name, file);
  }
  if (mod.cooldown === undefined) {
    fail(`${r} (/${json.name}): manca "cooldown" (richiesto numerico)`);
  } else if (typeof mod.cooldown !== 'number' || !Number.isFinite(mod.cooldown) || mod.cooldown < 0) {
    fail(`${r} (/${json.name}): cooldown non numerico valido: ${JSON.stringify(mod.cooldown)}`);
  }
}

// ---------------------------------------------------------------- (b) EVENTI
console.log('== [2/4] Eventi ==');
eventFiles = collectJs(EVENTS_DIR, false);
console.log(`File evento trovati: ${eventFiles.length}`);

const seenEvents = new Map(); // eventName -> file
for (const file of eventFiles) {
  const r = rel(file);
  let mod;
  try {
    delete require.cache[require.resolve(file)];
    mod = require(file);
  } catch (e) {
    fail(`${r}: require fallito: ${e.message.split('\n')[0]}`);
    continue;
  }
  if (!mod || typeof mod !== 'object') {
    fail(`${r}: export non è un oggetto`);
    continue;
  }
  if (!mod.name || typeof mod.name !== 'string') {
    fail(`${r}: manca export "name" (stringa evento discord.js)`);
  }
  if (typeof mod.execute !== 'function') {
    fail(`${r}: manca export "execute" (function)`);
  }
  if (mod.name) {
    if (seenEvents.has(mod.name)) {
      // Pattern multi-listener voluto: index.js registra UN listener per file
      // via client.on(), quindi più file sullo stesso evento guildMemberAdd
      // (antiRaid.js = rilevazione raid, autorole.js = assegnazione ruoli,
      // guildMemberAdd.js = messaggio welcome) fanno cose DIVERSE ed è ok.
      // Solo guildMemberAdd è ammesso in multi-listener -> WARNING, altri ERROR.
      const prev = rel(seenEvents.get(mod.name));
      if (mod.name === 'guildMemberAdd' || mod.name === require('discord.js').Events.GuildMemberAdd) {
        warn(`Evento multi-listener "${mod.name}" (pattern voluto): ${prev} <-> ${r}`);
      } else {
        fail(`Evento duplicato "${mod.name}": ${prev} <-> ${r} (due listener sullo stesso evento!)`);
      }
    } else {
      seenEvents.set(mod.name, file);
    }
  }
  if (mod.once !== undefined && typeof mod.once !== 'boolean') {
    fail(`${r}: "once" deve essere boolean, trovato ${typeof mod.once}`);
  }
}

// ------------------------------------------------------- (c) DATABASE (qatest)
console.log('== [3/4] Database (chiavi qatest) ==');
const QGUILD = 'qatest_guild';
const QUSER = 'qatest_user';
const QCHAN = 'qatest_channel';

function scrubTestKeys() {
  // Rimuove ogni traccia qatest dai JSON noti + eventuali file lazy (suggest/giveaways).
  // Ritorna lista dei file toccati per il ripristino.
  const touched = [];
  let jsonDb;
  try {
    jsonDb = require(path.join(DB_DIR, 'jsonDb.js'));
  } catch {
    return touched;
  }
  const candidates = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
  for (const name of candidates) {
    const file = jsonDb.dbFile(name);
    if (!fs.existsSync(file)) continue;
    let data;
    try {
      data = jsonDb.load(file);
    } catch {
      continue;
    }
    if (!data || typeof data !== 'object') continue;
    let changed = false;
    if (data[QGUILD] !== undefined) {
      delete data[QGUILD];
      changed = true;
    }
    if (data.counters && typeof data.counters === 'object' && data.counters[QGUILD] !== undefined) {
      delete data.counters[QGUILD];
      changed = true;
    }
    // giveaways.json è indicizzato per messageId: rimuovi entry il cui guildId/channel è qatest
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v && typeof v === 'object' && (v.guildId === QGUILD || v.channelId === QCHAN || k.startsWith('qatest'))) {
        delete data[k];
        changed = true;
      }
    }
    // tickets.json: dentro db[qatest] già rimosso sopra; pulisci anche ticket con channelId qatest
    for (const gid of Object.keys(data)) {
      const g = data[gid];
      if (g && typeof g === 'object' && g.tickets && typeof g.tickets === 'object' && g.tickets[QCHAN] !== undefined) {
        delete g.tickets[QCHAN];
        changed = true;
      }
    }
    if (changed) {
      try {
        jsonDb.save(file, data);
        touched.push(path.relative(ROOT, file));
      } catch (e) {
        fail(`Cleanup ${name}.json fallito: ${e.message}`);
      }
    }
  }
  return touched;
}

try {
  // Scansione DINAMICA: tutti i moduli database (resiste a file aggiunti da altri agenti).
  // jsonDb escluso dal check "export funzionale" (è l'infrastruttura, testata via roundtrip sotto).
  const dbModules = collectJs(DB_DIR, false);
  for (const fp of dbModules) {
    const f = path.basename(fp);
    if (!fs.existsSync(fp)) {
      fail(`src/database/${f}: file mancante`);
      continue;
    }
    try {
      delete require.cache[require.resolve(fp)];
      require(fp);
    } catch (e) {
      fail(`src/database/${f}: require fallito: ${e.message.split('\n')[0]}`);
    }
  }

  // jsonDb: roundtrip su file temporaneo (non sporca src/database)
  try {
    const { load, save } = require(path.join(DB_DIR, 'jsonDb.js'));
    const tmp = path.join(fs.realpathSync(os.tmpdir()), `smoke_qatest_${process.pid}.json`);
    save(tmp, { [QGUILD]: { v: 1 } });
    const back = load(tmp);
    if (!back[QGUILD] || back[QGUILD].v !== 1) fail('jsonDb: roundtrip load/save non riuscito (qatest)');
    fs.rmSync(tmp, { force: true });
  } catch (e) {
    fail(`jsonDb roundtrip (qatest): ${e.message.split('\n')[0]}`);
  }

  // economy
  try {
    const eco = require(path.join(DB_DIR, 'economy.js'));
    eco.getUser(QGUILD, QUSER);
    const plus = eco.addBalance(QGUILD, QUSER, 100);
    if (plus.balance !== 100) fail(`economy: addBalance +100 atteso 100, ottenuto ${plus.balance}`);
    const minus = eco.addBalance(QGUILD, QUSER, -30);
    if (minus.balance !== 70) fail(`economy: addBalance -30 atteso 70, ottenuto ${minus.balance}`);
    const lb = eco.getLeaderboard(QGUILD, 5);
    if (!Array.isArray(lb) || !lb.some((e) => e.id === QUSER)) fail('economy: getLeaderboard non contiene qatest_user');
  } catch (e) {
    fail(`economy (qatest): ${e.message.split('\n')[0]}`);
  }

  // levels
  try {
    const lv = require(path.join(DB_DIR, 'levels.js'));
    const before = lv.getLevel(QGUILD, QUSER);
    if (before.xp !== 0 || before.level !== 0) fail(`levels: getLevel nuovo utente atteso {0,0}, ottenuto ${JSON.stringify(before)}`);
    if (typeof lv.xpForLevel !== 'function' || lv.xpForLevel(0) !== 100) fail('levels: xpForLevel(0) atteso 100');
    const res = lv.addXp(QGUILD, QUSER, 50);
    if (res.xp !== 50) fail(`levels: addXp 50 atteso xp=50, ottenuto ${JSON.stringify(res)}`);
    const lb = lv.getLeaderboard(QGUILD, 5);
    if (!Array.isArray(lb) || !lb.some((e) => e.id === QUSER)) fail('levels: getLeaderboard non contiene qatest_user');
  } catch (e) {
    fail(`levels (qatest): ${e.message.split('\n')[0]}`);
  }

  // warnings
  try {
    const w = require(path.join(DB_DIR, 'warnings.js'));
    const w0 = w.getWarnings(QGUILD, QUSER);
    if (!Array.isArray(w0) || w0.length !== 0) fail('warnings: getWarnings nuovo utente atteso []');
    const added = w.addWarn(QGUILD, QUSER, { modId: QUSER, reason: 'qa smoke' });
    if (!added || !added.id) fail('warnings: addWarn non ritorna {id,...}');
    if (w.getWarnings(QGUILD, QUSER).length !== 1) fail('warnings: dopo addWarn atteso 1 warn');
    if (w.removeWarn(QGUILD, QUSER, added.id) !== true) fail('warnings: removeWarn(id valido) atteso true');
    w.addWarn(QGUILD, QUSER, { modId: QUSER, reason: 'qa2' });
    w.clearWarnings(QGUILD, QUSER);
    if (w.getWarnings(QGUILD, QUSER).length !== 0) fail('warnings: dopo clearWarnings atteso []');
  } catch (e) {
    fail(`warnings (qatest): ${e.message.split('\n')[0]}`);
  }

  // guildConfig
  try {
    const g = require(path.join(DB_DIR, 'guildConfig.js'));
    const cfg = g.getGuild(QGUILD);
    if (!cfg || !cfg.automod || cfg.automod.enabled !== true) fail('guildConfig: getGuild(qatest) senza defaults attesi');
    g.updateGuild(QGUILD, { logChannelId: null });
    const cfg2 = g.getGuild(QGUILD);
    if (!cfg2 || cfg2.logChannelId !== null) fail('guildConfig: updateGuild/getGuild roundtrip fallito (qatest)');
  } catch (e) {
    fail(`guildConfig (qatest): ${e.message.split('\n')[0]}`);
  }

  // tickets
  try {
    const t = require(path.join(DB_DIR, 'tickets.js'));
    if (!t.TICKET_TYPES || !t.TICKET_TYPES.supporto) fail('tickets: TICKET_TYPES.supporto mancante');
    t.setConfig(QGUILD, { maxPerUser: 3 });
    const n = t.nextNumber(QGUILD);
    if (typeof n !== 'number' || n < 1) fail(`tickets: nextNumber(qatest) atteso >=1, ottenuto ${n}`);
    t.saveTicket(QGUILD, {
      channelId: QCHAN, ownerId: QUSER, type: 'supporto',
      number: n, status: 'open', claimedBy: null, createdAt: Date.now(),
    });
    const got = t.getTicket(QGUILD, QCHAN);
    if (!got || got.ownerId !== QUSER) fail('tickets: getTicket(qatest) non ritorna il ticket salvato');
    if (t.getUserOpenTickets(QGUILD, QUSER).length < 1) fail('tickets: getUserOpenTickets(qatest) atteso >=1');
    const stats = t.getStats(QGUILD);
    if (!stats || stats.total < 1) fail('tickets: getStats(qatest) atteso total>=1');
  } catch (e) {
    fail(`tickets (qatest): ${e.message.split('\n')[0]}`);
  }
} finally {
  const touched = scrubTestKeys();
  console.log(`Cleanup chiavi qatest: ${touched.length ? touched.join(', ') : 'nessun file sporcato (ok)'}`);
  // Verifica: nessuna chiave qatest rimasta nei JSON
  try {
    const { load, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
    const jsonNames = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
    for (const name of jsonNames) {
      const f = dbFile(name);
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, 'utf8');
      if (raw.includes('qatest')) fail(`Cleanup incompleto: ${rel(f)} contiene ancora "qatest"`);
      // sanity: JSON ancora valido
      try {
        load(f);
      } catch {
        fail(`JSON corrotto dopo cleanup: ${rel(f)}`);
      }
    }
  } catch (e) {
    fail(`Verifica cleanup: ${e.message.split('\n')[0]}`);
  }
}

// ------------------------------------------------- (e) Collisioni cross-modulo
console.log('== [4/4] Collisioni cross-modulo ==');
try {
  const allSrc = [...commandFiles, ...eventFiles,
    ...collectJs(path.join(ROOT, 'src', 'handlers'), true),
    ...collectJs(path.join(ROOT, 'src', 'utils'), true)];
  const customIdMap = new Map(); // literal -> [file]
  const litRe = /setCustomId\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const file of allSrc) {
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    litRe.lastIndex = 0;
    let m;
    while ((m = litRe.exec(src)) !== null) {
      const id = m[1];
      if (id.includes('${')) continue; // dinamico (es. nuke_confirm:${id}, trivia nonce)
      if (!customIdMap.has(id)) customIdMap.set(id, []);
      customIdMap.get(id).push(rel(file));
    }
  }
  for (const [id, files] of customIdMap) {
    const uniq = [...new Set(files)];
    if (uniq.length > 1) fail(`customId duplicato "${id}" in: ${uniq.join(' <-> ')}`);
  }
  console.log(`customId letterali unici scansionati: ${customIdMap.size}`);
} catch (e) {
  fail(`Scansione customId: ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------------------------ REPORT
console.log('\n================ SMOKE TEST ================');
console.log(`Comandi: ${commandFiles.length} file, ${seenNames.size} nomi unici (${[...seenNames.keys()].sort().join(', ')})`);
console.log(`Eventi: ${eventFiles.length} file (${[...seenEvents.keys()].sort().join(', ')})`);
console.log(`FILES_SNAPSHOT commands=${commandFiles.length} events=${eventFiles.length}`);
if (warnings.length) {
  console.log(`\nWARNING (${warnings.length}):`);
  for (const w of warnings) console.log(`  ⚠️  ${w}`);
}
if (errors.length) {
  console.log(`\n❌ ERRORI (${errors.length}):`);
  for (const e of errors) console.log(`  ❌ ${e}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ Tutto ok: comandi, eventi e database superano lo smoke test.');
}
