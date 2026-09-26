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
 *  (c2) NUOVI moduli DB attesi (reactionRoles, autoresponder, invites,
 *      tempvoice, stanze, levelRewards, analytics) + jobs/ticketAutoclose
 *      require-safe: roundtrip con chiavi `qatest_*` + cleanup verificato.
 *  (c3) NUOVI moduli DB attesi (shop, lotteria, rep, sfide, confessioni):
 *      roundtrip con chiavi `qatest_*` + cleanup verificato (solo DB,
 *      mai execute() di comandi, mai scritture su canali, mai soldi veri:
 *      i pot/premi dei moduli sono contatori interni su chiavi qatest).
 *      Se un modulo non esiste ancora: WARNING (skip), non errore (lavori in corso).
 *      Regola duplicati-evento invariata (la gestisce il revisore).
 *  (c4) LOTTO roadmap QA (questo file, dentro il try con cleanup qatest):
 *      cases + customCommands (roundtrip `qatest_*` adattivo), shop riuso
 *      (già coperto in c3, nessun duplicato), store (collection qatest
 *      set/get su backend json; sqlite solo se node:sqlite disponibile,
 *      altrimenti warning), logger (LOG_DIR tmp + cleanup), i18n+locales
 *      (t fallback), backup (solo export check, MAI start), music
 *      require-safe anche senza dipendenze vocali (require vocale eager a
  *      top-level = FAIL con messaggio chiaro). Assente/API incompleta ->
  *      WARNING (skip, lavori in corso); presente ma rotto -> FAIL.
  *      Regola duplicati-evento invariata (la gestisce il revisore).
  *  (c5) LOTTO QA (questo file, dentro il try con cleanup qatest/w1test/gtest):
  *      theme (contratto COLORS,ok,err,info,applyFooter,bar,medal,num,
  *      truncate,paginate) + env (validateEnv: token mancante->errors,
  *      completo->ok) + backup restore (export restoreBackup/
  *      isValidBackupName, traversal rifiutato, roundtrip SOLO su dir tmp —
  *      MAI restore veri su dati reali) + aiUsage (roundtrip con
  *      snapshot/restore del contatore odierno) + music riuso (già in c4).
  *      Assente/API incompleta -> WARNING (skip); presente ma rotto -> FAIL.
  *      Regola duplicati-evento invariata (la gestisce il revisore).
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
console.log('== [1/5] Comandi ==');
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
console.log('== [2/5] Eventi ==');
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
      // via client.on(), quindi più file sullo stesso evento fanno cose DIVERSE
      // ed è ok. Allowlist revisionata dal revisore finale:
      // - guildMemberAdd: welcome (guildMemberAdd.js), ruoli (autorole.js),
      //   raid (antiRaid.js), joins analytics (analyticsMembers.js),
      //   inviti (inviteTracker.js, + remove lazy-attach).
      // - messageCreate: XP/automod/ticket-touch (messageCreate.js),
      //   autoresponder (autoResponder.js, solo lettura + reply),
      //   conteggio analytics (analyticsMessages.js, solo bump).
      // - voiceStateUpdate: vocali temporanee (tempVoice.js, create/cleanup),
      //   XP vocale (voiceXp.js, join-time/exit XP).
      // Corpi verificati disgiunti dal revisore. Altri duplicati restano ERRORI.
      const prev = rel(seenEvents.get(mod.name));
      const { Events: Ev } = require('discord.js');
      const allowedMulti = new Set([
        'guildMemberAdd', Ev.GuildMemberAdd,
        'messageCreate', Ev.MessageCreate,
        'voiceStateUpdate', Ev.VoiceStateUpdate,
      ]);
      if (allowedMulti.has(mod.name)) {
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
console.log('== [3/5] Database (chiavi qatest) ==');
const QGUILD = 'qatest_guild';
const QUSER = 'qatest_user';
const QCHAN = 'qatest_channel';

function scrubTestKeys() {
  // Rimuove ogni traccia qatest/w1test/gtest dai JSON noti + eventuali file lazy (suggest/giveaways).
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
    for (const gk of [QGUILD, 'w1test_guild', 'gtest_guild', 'qatest', 'w1test', 'gtest']) {
      if (data[gk] !== undefined) {
        delete data[gk];
        changed = true;
      }
    }
    if (data.counters && typeof data.counters === 'object') {
      for (const gk of [QGUILD, 'w1test_guild', 'gtest_guild']) {
        if (data.counters[gk] !== undefined) {
          delete data.counters[gk];
          changed = true;
        }
      }
    }
    const isTestStr = (s) => typeof s === 'string' && /^(qatest|w1test|gtest)/.test(s);
    // giveaways.json è indicizzato per messageId: rimuovi entry il cui guildId/channel è di test
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (isTestStr(k) || (v && typeof v === 'object' && (v.guildId === QGUILD || v.channelId === QCHAN || isTestStr(v.guildId) || isTestStr(v.channelId)))) {
        delete data[k];
        changed = true;
      }
    }
    // tickets.json: dentro db[qatest] già rimosso sopra; pulisci anche ticket con channelId di test
    for (const gid of Object.keys(data)) {
      const g = data[gid];
      if (g && typeof g === 'object' && g.tickets && typeof g.tickets === 'object') {
        for (const ck of [QCHAN, 'w1test_channel', 'gtest_channel']) {
          if (g.tickets[ck] !== undefined) {
            delete g.tickets[ck];
            changed = true;
          }
        }
        for (const tk of Object.keys(g.tickets)) {
          if (/^(qatest|w1test|gtest)/.test(tk)) {
            delete g.tickets[tk];
            changed = true;
          }
        }
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

  // ---- NUOVI moduli DB attesi (lavori in corso di altri agenti) ----
  // Se un modulo non esiste ancora al momento del test: WARNING (skip), non errore.
  // Se esiste: require + roundtrip con chiavi qatest_* (cleanup via scrubTestKeys/finally).
  // Regola duplicati-evento NON toccata (la gestisce il revisore).
  const QROLE = 'qatest_role';
  function skipMissing(label, relPath) {
    warn(`${label}: modulo non ancora presente (${relPath}) — skip (lavori in corso)`);
  }

  // reactionRoles
  try {
    const fp = path.join(DB_DIR, 'reactionRoles.js');
    if (!fs.existsSync(fp)) {
      skipMissing('reactionRoles', 'src/database/reactionRoles.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const rr = require(fp);
      const p0 = rr.getPanel(QGUILD);
      if (!p0 || !Array.isArray(p0.options)) fail('reactionRoles: getPanel(qatest) senza defaults attesi');
      rr.setPanel(QGUILD, { title: 'qatest panel' });
      if (rr.getPanel(QGUILD).title !== 'qatest panel') fail('reactionRoles: setPanel/getPanel roundtrip fallito (qatest)');
      const added = rr.addOption(QGUILD, { roleId: QROLE, label: 'qatest', emoji: '⭐' });
      if (!added || !added.added) fail('reactionRoles: addOption(qatest) atteso added=true');
      if (!rr.getPanel(QGUILD).options.some((o) => o.roleId === QROLE)) fail('reactionRoles: getPanel non contiene qatest_role');
      const rem = rr.removeOption(QGUILD, QROLE);
      if (!rem || !rem.removed) fail('reactionRoles: removeOption(qatest) atteso removed=true');
    }
  } catch (e) {
    fail(`reactionRoles (qatest): ${e.message.split('\n')[0]}`);
  }

  // autoresponder
  try {
    const fp = path.join(DB_DIR, 'autoresponder.js');
    if (!fs.existsSync(fp)) {
      skipMissing('autoresponder', 'src/database/autoresponder.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const ar = require(fp);
      if (ar.listTriggers(QGUILD).length !== 0) fail('autoresponder: listTriggers nuovo server atteso []');
      const res = ar.addTrigger(QGUILD, { match: 'qatest ping', response: 'qatest pong' });
      if (!res || !res.ok || !res.trigger || !res.trigger.id) fail('autoresponder: addTrigger(qatest) non ritorna {ok,trigger.id}');
      if (ar.listTriggers(QGUILD).length !== 1) fail('autoresponder: dopo addTrigger atteso 1 trigger');
      if (res && res.ok && ar.removeTrigger(QGUILD, res.trigger.id) !== true) fail('autoresponder: removeTrigger(id valido) atteso true');
      ar.clearTriggers(QGUILD);
      if (ar.listTriggers(QGUILD).length !== 0) fail('autoresponder: dopo clearTriggers atteso []');
    }
  } catch (e) {
    fail(`autoresponder (qatest): ${e.message.split('\n')[0]}`);
  }

  // invites
  try {
    const fp = path.join(DB_DIR, 'invites.js');
    if (!fs.existsSync(fp)) {
      skipMissing('invites', 'src/database/invites.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const inv = require(fp);
      const up = inv.upsertInvite(QGUILD, 'qatest_code', { uses: 3, inviterId: QUSER });
      if (!up || up.uses !== 3) fail('invites: upsertInvite(qatest) atteso uses=3');
      if (!inv.getCache(QGUILD)['qatest_code']) fail('invites: getCache non contiene qatest_code');
      inv.recordJoin(QGUILD, QUSER, QUSER);
      const st = inv.getStats(QGUILD, QUSER);
      if (!st || st.joins < 1) fail('invites: getStats(qatest) atteso joins>=1');
      if (inv.getInviter(QGUILD, QUSER) !== QUSER) fail('invites: getInviter(qatest) atteso qatest_user');
      inv.recordLeave(QGUILD, QUSER);
      if (inv.removeInvite(QGUILD, 'qatest_code') !== true) fail('invites: removeInvite(qatest) atteso true');
      if (!inv.getLeaderboard(QGUILD, 5).some((e) => e.userId === QUSER)) fail('invites: getLeaderboard non contiene qatest_user');
    }
  } catch (e) {
    fail(`invites (qatest): ${e.message.split('\n')[0]}`);
  }

  // tempvoice
  try {
    const fp = path.join(DB_DIR, 'tempvoice.js');
    if (!fs.existsSync(fp)) {
      skipMissing('tempvoice', 'src/database/tempvoice.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const tv = require(fp);
      if (!tv.getConfig(QGUILD) || tv.getConfig(QGUILD).lobbyChannelId !== null) fail('tempvoice: getConfig(qatest) senza defaults attesi');
      tv.setConfig(QGUILD, { lobbyChannelId: QCHAN });
      if (tv.getConfig(QGUILD).lobbyChannelId !== QCHAN) fail('tempvoice: setConfig/getConfig roundtrip fallito (qatest)');
      tv.saveTemp(QGUILD, QCHAN, { ownerId: QUSER });
      if (!tv.getTemp(QGUILD, QCHAN) || tv.getTemp(QGUILD, QCHAN).ownerId !== QUSER) fail('tempvoice: getTemp(qatest) non ritorna owner qatest_user');
      if (!tv.isTemp(QGUILD, QCHAN)) fail('tempvoice: isTemp(qatest) atteso true');
      if (tv.removeTemp(QGUILD, QCHAN) !== true) fail('tempvoice: removeTemp(qatest) atteso true');
    }
  } catch (e) {
    fail(`tempvoice (qatest): ${e.message.split('\n')[0]}`);
  }

  // stanze
  try {
    const fp = path.join(DB_DIR, 'stanze.js');
    if (!fs.existsSync(fp)) {
      skipMissing('stanze', 'src/database/stanze.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const sz = require(fp);
      sz.saveRoom(QGUILD, QCHAN, { ownerId: QUSER, type: 'qatest' });
      const room = sz.getRoom(QGUILD, QCHAN);
      if (!room || room.ownerId !== QUSER) fail('stanze: getRoom(qatest) non ritorna owner qatest_user');
      if (!sz.getUserRooms(QGUILD, QUSER).some((r) => r.channelId === QCHAN)) fail('stanze: getUserRooms non contiene qatest_channel');
      if (sz.removeRoom(QGUILD, QCHAN) !== true) fail('stanze: removeRoom(qatest) atteso true');
    }
  } catch (e) {
    fail(`stanze (qatest): ${e.message.split('\n')[0]}`);
  }

  // levelRewards
  try {
    const fp = path.join(DB_DIR, 'levelRewards.js');
    if (!fs.existsSync(fp)) {
      skipMissing('levelRewards', 'src/database/levelRewards.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const lr = require(fp);
      if (!Array.isArray(lr.listRewards(QGUILD)) || lr.listRewards(QGUILD).length !== 0) fail('levelRewards: listRewards nuovo server atteso []');
      lr.setReward(QGUILD, 5, QROLE);
      if (lr.getReward(QGUILD, 5) !== QROLE) fail('levelRewards: getReward(5) atteso qatest_role');
      if (!lr.rewardsUpTo(QGUILD, 5).some((r) => r.level === 5)) fail('levelRewards: rewardsUpTo(5) non contiene livello 5');
      if (lr.removeReward(QGUILD, 5) !== true) fail('levelRewards: removeReward(5) atteso true');
    }
  } catch (e) {
    fail(`levelRewards (qatest): ${e.message.split('\n')[0]}`);
  }

  // analytics
  try {
    const fp = path.join(DB_DIR, 'analytics.js');
    if (!fs.existsSync(fp)) {
      skipMissing('analytics', 'src/database/analytics.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const an = require(fp);
      if (an.bump(QGUILD, 'nope') !== null) fail('analytics: bump(field non valido) atteso null');
      const day = an.bump(QGUILD, 'messages');
      if (!day || day.messages < 1) fail('analytics: bump(messages) atteso messages>=1');
      if (!an.getDays(QGUILD, 7).some((d) => d.messages >= 1)) fail('analytics: getDays non contiene il bump qatest');
      if (!an.totals(QGUILD, 7) || an.totals(QGUILD, 7).messages < 1) fail('analytics: totals(qatest) atteso messages>=1');
    }
  } catch (e) {
    fail(`analytics (qatest): ${e.message.split('\n')[0]}`);
  }

  // ---- NUOVI moduli DB attesi (shop, lotteria, rep, sfide, confessioni) ----
  // Solo DB + require-safe: mai execute() di comandi, mai scritture su canali,
  // mai soldi veri (pot/premi = contatori interni su chiavi qatest_* isolate).
  // Se un modulo non esiste ancora: WARNING (skip), non errore (lavori in corso).
  // Se esiste ma l'API è incompleta: WARNING (WIP). Se il roundtrip è rotto: FAIL.
  // Cleanup via scrubTestKeys/finally (chiave qatest_guild) + verifica finale.

  // shop — catalogo ruoli { [guild]: { [roleId]: { price } } } (solo listino, nessun addebito)
  try {
    const fp = path.join(DB_DIR, 'shop.js');
    if (!fs.existsSync(fp)) {
      skipMissing('shop', 'src/database/shop.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const sh = require(fp);
      if (sh.listItems(QGUILD).length !== 0) fail('shop: listItems nuovo server atteso []');
      if (sh.getItem(QGUILD, QROLE) !== null) fail('shop: getItem(qatest) nuovo atteso null');
      const it = sh.setItem(QGUILD, QROLE, 250);
      if (!it || it.price !== 250) fail('shop: setItem(qatest,250) atteso price=250');
      const got = sh.getItem(QGUILD, QROLE);
      if (!got || got.price !== 250) fail('shop: getItem(qatest) non ritorna price=250');
      if (!sh.listItems(QGUILD).some((e) => e.roleId === QROLE)) fail('shop: listItems non contiene qatest_role');
      let threw = false;
      try { sh.setItem(QGUILD, QROLE, 0); } catch { threw = true; }
      if (!threw) fail('shop: setItem(price=0) dovrebbe lanciare (prezzo intero >= 1)');
      if (sh.removeItem(QGUILD, QROLE) !== true) fail('shop: removeItem(qatest) atteso true');
      if (sh.getItem(QGUILD, QROLE) !== null) fail('shop: dopo removeItem atteso null');
    }
  } catch (e) {
    fail(`shop (qatest): ${e.message.split('\n')[0]}`);
  }

  // lotteria — pot/biglietti interni (non tocca economy, nessun channel, nessun draw qui)
  try {
    const fp = path.join(DB_DIR, 'lotteria.js');
    if (!fs.existsSync(fp)) {
      skipMissing('lotteria', 'src/database/lotteria.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const lo = require(fp);
      lo.resetLottery(QGUILD); // stato pulito (solo chiave qatest)
      const s0 = lo.getState(QGUILD);
      if (!s0 || s0.pot !== 0) fail('lotteria: getState dopo reset atteso pot=0');
      if (lo.validCount(0) !== null) fail('lotteria: validCount(0) atteso null');
      lo.addTickets(QGUILD, QUSER, 2);
      if (lo.totalTickets(QGUILD) < 2) fail('lotteria: totalTickets(qatest) atteso >=2');
      const s1 = lo.getState(QGUILD);
      if (!s1.entries || s1.entries[QUSER] !== 2) fail('lotteria: getState.entries senza 2 biglietti qatest_user');
      if (s1.pot < 2 * s1.ticketPrice) fail('lotteria: pot(qatest) minore del costo dei 2 biglietti');
      lo.resetLottery(QGUILD);
      if (lo.totalTickets(QGUILD) !== 0) fail('lotteria: dopo resetLottery atteso 0 biglietti');
    }
  } catch (e) {
    fail(`lotteria (qatest): ${e.message.split('\n')[0]}`);
  }

  // rep — reputazione +1 con cooldown 24h (solo DB, nessun channel)
  try {
    const fp = path.join(DB_DIR, 'rep.js');
    if (!fs.existsSync(fp)) {
      skipMissing('rep', 'src/database/rep.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const rp = require(fp);
      const GIVER = `${QUSER}_giver`;
      const NOW = 1700000000000;
      const r0 = rp.getRep(QGUILD, QUSER);
      if (!r0 || r0.count !== 0) fail('rep: getRep nuovo utente atteso count=0');
      if (rp.canGive(QGUILD, GIVER, QUSER, NOW) !== true) fail('rep: canGive prima volta atteso true');
      const after = rp.giveRep(QGUILD, GIVER, QUSER, NOW);
      if (!after || after.count !== 1) fail('rep: giveRep atteso count=1');
      if (rp.getLastGiven(QGUILD, GIVER, QUSER) !== NOW) fail('rep: getLastGiven(qatest) non ritorna il timestamp usato');
      if (rp.canGive(QGUILD, GIVER, QUSER, NOW) !== false) fail('rep: canGive subito dopo atteso false (cooldown 24h)');
      if (rp.canGive(QGUILD, GIVER, QUSER, NOW + rp.COOLDOWN) !== true) fail('rep: canGive dopo COOLDOWN atteso true');
      if (!rp.getLeaderboard(QGUILD, 5).some((e) => e.id === QUSER)) fail('rep: getLeaderboard non contiene qatest_user');
    }
  } catch (e) {
    fail(`rep (qatest): ${e.message.split('\n')[0]}`);
  }

  // sfide — sfida settimanale messaggi (solo DB: nessun premio economy accreditato qui)
  try {
    const fp = path.join(DB_DIR, 'sfide.js');
    if (!fs.existsSync(fp)) {
      skipMissing('sfide', 'src/database/sfide.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const sf = require(fp);
      const NOW = 1700000000000;
      sf.resetSfida(QGUILD, NOW); // ciclo pulito (solo chiave qatest)
      const s0 = sf.getSfida(QGUILD, NOW);
      if (!s0 || !s0.current || !s0.current.id) fail('sfide: getSfida(qatest) senza current.id');
      const p1 = sf.addProgress(QGUILD, QUSER, NOW);
      if (!p1 || p1.count !== 1 || p1.completed !== false) fail(`sfide: addProgress x1 atteso {count:1,completed:false}, ottenuto ${JSON.stringify(p1)}`);
      if (sf.getProgress(QGUILD, QUSER, NOW) !== 1) fail('sfide: getProgress(qatest) atteso 1');
      if (sf.isCompletata(QGUILD, QUSER, NOW) !== false) fail('sfide: isCompletata(qatest) atteso false dopo 1 progresso');
      if (!sf.getMiniLeaderboard(QGUILD, 5, NOW).some((e) => e.id === QUSER)) fail('sfide: getMiniLeaderboard non contiene qatest_user');
    }
  } catch (e) {
    fail(`sfide (qatest): ${e.message.split('\n')[0]}`);
  }

  // confessioni — config canale + cooldown anti-abuso in-memory (solo DB, nessuna
  // scrittura su canali: setCanale memorizza solo un ID stringa su chiave qatest).
  // Assente -> WARNING (skip). Presente ma API incompleta -> WARNING (WIP).
  // Roundtrip rotto -> FAIL. Cleanup esplicito (disable) + scrubTestKeys/finally.
  try {
    const candidates = [
      'src/database/confessioni.js',
      'src/database/confessione.js',
      'src/database/confessions.js',
      'src/database/confession.js',
      'src/utils/confessioni.js',
    ];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('confessioni', 'src/database/confessioni.js (o varianti confessione/confessions)');
    } else {
      delete require.cache[require.resolve(found)];
      const cf = require(found);
      const tag = path.relative(ROOT, found);
      if (!cf || (typeof cf !== 'object' && typeof cf !== 'function')) {
        fail(`confessioni: export non valido (${tag})`);
      } else {
        const hasGet = typeof cf.getConfessioni === 'function';
        const hasSet = typeof cf.setCanale === 'function';
        const hasDis = typeof cf.disableConfessioni === 'function';
        const hasWait = typeof cf.secondiAttesa === 'function';
        const hasReg = typeof cf.registraConfessione === 'function';
        if (!hasGet || !hasSet || !hasDis) {
          warn(`confessioni: API incompleta in ${tag} (get=${hasGet ? 'ok' : '-'}/setCanale=${hasSet ? 'ok' : '-'}/disable=${hasDis ? 'ok' : '-'}; exports: ${cf && typeof cf === 'object' ? Object.keys(cf).sort().join(',') : typeof cf}) — skip (WIP)`);
        } else {
          const g0 = cf.getConfessioni(QGUILD);
          if (!g0 || g0.channelId !== null) fail('confessioni: getConfessioni(qatest) nuovo atteso channelId=null');
          cf.setCanale(QGUILD, QCHAN);
          if (cf.getConfessioni(QGUILD).channelId !== QCHAN) fail('confessioni: setCanale/getConfessioni roundtrip fallito (qatest)');
          cf.disableConfessioni(QGUILD);
          if (cf.getConfessioni(QGUILD).channelId !== null) fail('confessioni: dopo disableConfessioni atteso channelId=null');
          if (hasWait && hasReg) {
            const NOW = 1700000000000;
            if (typeof cf._resetCooldowns === 'function') cf._resetCooldowns();
            if (cf.secondiAttesa(QUSER, NOW) !== 0) fail('confessioni: secondiAttesa prima volta atteso 0');
            cf.registraConfessione(QUSER, NOW);
            if (!(cf.secondiAttesa(QUSER, NOW) > 0)) fail('confessioni: secondiAttesa dopo registra atteso >0');
            if (cf.secondiAttesa(QUSER, NOW + (cf.COOLDOWN_MS || 60000)) !== 0) fail('confessioni: secondiAttesa dopo COOLDOWN atteso 0');
            if (typeof cf._resetCooldowns === 'function') cf._resetCooldowns();
            if (cf.secondiAttesa(QUSER, NOW) !== 0) fail('confessioni: secondiAttesa dopo _resetCooldowns atteso 0');
          } else {
            warn(`confessioni: cooldown API assente in ${tag} (secondiAttesa/registraConfessione) — config sola verificata`);
          }
        }
      }
    }
  } catch (e) {
    fail(`confessioni (qatest): ${e.message.split('\n')[0]}`);
  }

  // ---- LOTTO dashboard+permessi+AI: customPerms (set/get/has/clear) ----
  // Candidati multipli: il modulo può vivere in database/ o utils/ con nomi
  // diversi a seconda dell'agente. Se assente: WARNING (skip, lavori in corso).
  // Se presente ma API incompleta: WARNING (WIP). Se API completa ma
  // roundtrip rotto: FAIL. Cleanup via scrubTestKeys (generico su *.json).
  try {
    const QCMD = 'qatest_cmd';
    const candidates = [
      'src/database/customPerms.js',
      'src/database/permissions.js',
      'src/utils/customPerms.js',
      'src/utils/permissions.js',
    ];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('customPerms', 'src/database/customPerms.js (o permissions)');
    } else {
      delete require.cache[require.resolve(found)];
      const cp = require(found);
      const tag = path.relative(ROOT, found);
      const pick = (...names) => {
        for (const n of names) if (cp && typeof cp[n] === 'function') return { fn: cp[n], name: n };
        return null;
      };
      const setE = pick('setCommandRoles', 'setPerm', 'set', 'setCustomPerm', 'setPermission', 'grant', 'allow', 'addPerm');
      const getE = pick('getCommandRoles', 'getPerm', 'get', 'getPerms', 'getCustomPerm', 'getPermission', 'getAll', 'list', 'listPerms');
      const hasE = pick('hasCustom', 'has', 'hasPerm', 'hasPermission', 'can', 'check', 'canUse', 'checkPerm');
      const clearE = pick('clearCommandRoles', 'clearAll', 'clear', 'clearPerm', 'clearPerms', 'clearPermissions', 'remove', 'removePerm', 'reset', 'deletePerm');
      if (!setE || !getE || !hasE || !clearE) {
        warn(`customPerms: API incompleta in ${tag} (set=${setE ? setE.name : '-'}/get=${getE ? getE.name : '-'}/has=${hasE ? hasE.name : '-'}/clear=${clearE ? clearE.name : '-'}; exports: ${cp && typeof cp === 'object' ? Object.keys(cp).sort().join(',') : typeof cp}) — skip (WIP)`);
      } else {
        const tryCall = (entry, argsList) => {
          let lastErr = null;
          for (const args of argsList) {
            try {
              return { ok: true, value: entry.fn(...args), via: `${entry.name}(${args.length})` };
            } catch (e) { lastErr = e; }
          }
          return { ok: false, error: lastErr };
        };
        // pulizia iniziale (best-effort, entrambe le arity)
        try { clearE.fn(QGUILD, QCMD); } catch { try { clearE.fn(QGUILD); } catch {} }
        // NOTA: le API reali validano gli ID ruolo come snowflake numerici
        // (customPerms.cleanRoleIds scarta 'qatest_role'): si usa quindi un
        // ID numerico fittizio QROLEID; la traccia è cercata come QROLEID o 'qatest'.
        const QROLEID = '123456789012345678';
        // SET: prova più forme (array ruoli numerici / stringa / oggetto)
        const setR = tryCall(setE, [
          [QGUILD, QCMD, [QROLEID]],
          [QGUILD, QCMD, QROLEID],
          [QGUILD, QCMD, [QROLE]],
          [QGUILD, QCMD, QROLE],
          [QGUILD, QCMD, { roles: [QROLEID] }],
          [QGUILD, { command: QCMD, roles: [QROLEID] }],
        ]);
        const hasTrace = (v) => {
          const s = JSON.stringify(v || '');
          return s.indexOf('qatest') !== -1 || s.indexOf(QROLEID) !== -1;
        };
        if (!setR.ok) fail(`customPerms: set fallito in ogni forma (qatest) in ${tag}: ${(setR.error && setR.error.message || '?').split('\n')[0]} (exports: ${Object.keys(cp).sort().join(',')})`);
        else {
          // GET: deve contenere traccia qatest
          const getR = tryCall(getE, [[QGUILD, QCMD], [QGUILD]]);
          if (!getR.ok) fail(`customPerms: get fallito (qatest) in ${tag}: ${(getR.error && getR.error.message || '?').split('\n')[0]}`);
          else if (!hasTrace(getR.value)) {
            fail(`customPerms: get senza traccia qatest dopo set (qatest) in ${tag} (via ${getR.via}): ${JSON.stringify(getR.value).slice(0, 160)}`);
          }
          // HAS: prima arity-2 (hasCustom), poi forme a 3+ argomenti
          const hasR = tryCall(hasE, [
            [QGUILD, QCMD],
            [QGUILD, QCMD, QROLEID],
            [QGUILD, QCMD, QROLE],
            [QGUILD, QCMD, QUSER],
            [QGUILD, QUSER, QCMD],
            [QGUILD, QCMD, { id: QUSER, roles: [QROLEID] }],
          ]);
          if (!hasR.ok) fail(`customPerms: has fallito (qatest) in ${tag}: ${(hasR.error && hasR.error.message || '?').split('\n')[0]}`);
          else if (hasR.value !== true && hasR.value !== 1) {
            fail(`customPerms: has(qatest) atteso true, ottenuto ${JSON.stringify(hasR.value)} in ${tag} (via ${hasR.via})`);
          }
          // CLEAR: poi get/has devono risultare vuoti/falsi
          tryCall(clearE, [[QGUILD, QCMD], [QGUILD]]);
          const getAfter = tryCall(getE, [[QGUILD, QCMD], [QGUILD]]);
          if (getAfter.ok && hasTrace(getAfter.value)) {
            fail(`customPerms: dopo clear ancora traccia qatest in ${tag}: ${JSON.stringify(getAfter.value).slice(0, 160)}`);
          }
          const hasAfter = tryCall(hasE, [[QGUILD, QCMD], [QGUILD, QCMD, QROLEID], [QGUILD, QCMD, QUSER]]);
          if (hasAfter.ok && (hasAfter.value === true || hasAfter.value === 1)) {
            fail(`customPerms: dopo clear has(qatest) ancora true in ${tag}`);
          }
        }
        // pulizia finale best-effort
        try { clearE.fn(QGUILD, QCMD); } catch { try { clearE.fn(QGUILD); } catch {} }
      }
    }
  } catch (e) {
    fail(`customPerms (qatest): ${e.message.split('\n')[0]}`);
  }

  // ---- LOTTO dashboard+permessi+AI: aiConfig (get/set/defaults) ----
  // Stessa policy: assente/incompleto -> WARNING (skip, lavori in corso);
  // presente ma roundtrip rotto -> FAIL. Cleanup via scrubTestKeys.
  try {
    const candidates = [
      'src/database/aiConfig.js',
      'src/utils/aiConfig.js',
    ];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('aiConfig', 'src/database/aiConfig.js (o utils/aiConfig)');
    } else {
      delete require.cache[require.resolve(found)];
      const ac = require(found);
      const tag = path.relative(ROOT, found);
      const pick = (...names) => {
        for (const n of names) if (ac && typeof ac[n] === 'function') return { fn: ac[n], name: n };
        return null;
      };
      const getE = pick('getAiConfig', 'getConfig', 'get', 'getSettings');
      const setE = pick('setAiConfig', 'setConfig', 'set', 'update', 'updateConfig');
      const defaults = (ac && (ac.DEFAULTS || ac.defaults)) || null;
      if (!getE || !setE) {
        warn(`aiConfig: API incompleta in ${tag} (get=${getE ? getE.name : '-'}/set=${setE ? setE.name : '-'}; exports: ${ac && typeof ac === 'object' ? Object.keys(ac).sort().join(',') : typeof ac}) — skip (WIP)`);
      } else {
        const tryCall = (entry, argsList) => {
          let lastErr = null;
          for (const args of argsList) {
            try {
              return { ok: true, value: entry.fn(...args), via: `${entry.name}(${args.length})` };
            } catch (e) { lastErr = e; }
          }
          return { ok: false, error: lastErr };
        };
        if (!defaults || typeof defaults !== 'object') warn(`aiConfig: DEFAULTS assenti in ${tag} (exports: ${Object.keys(ac).sort().join(',')})`);
        const g0 = tryCall(getE, [[QGUILD]]);
        if (!g0.ok) fail(`aiConfig: get(qatest) fallito in ${tag}: ${(g0.error && g0.error.message || '?').split('\n')[0]}`);
        else if (!g0.value || typeof g0.value !== 'object') fail(`aiConfig: get(qatest) atteso oggetto-config in ${tag}, ottenuto ${JSON.stringify(g0.value).slice(0, 120)}`);
        const s1 = tryCall(setE, [
          [QGUILD, { model: 'qatest-model' }],
          [QGUILD, { Model: 'qatest-model' }],
          [QGUILD, 'model', 'qatest-model'],
        ]);
        if (!s1.ok) fail(`aiConfig: set(qatest) fallito in ogni forma in ${tag}: ${(s1.error && s1.error.message || '?').split('\n')[0]}`);
        else {
          const g1 = tryCall(getE, [[QGUILD]]);
          if (!g1.ok) fail(`aiConfig: get dopo set fallito in ${tag}`);
          else if (JSON.stringify(g1.value || '').indexOf('qatest-model') === -1) {
            fail(`aiConfig: get dopo set non contiene "qatest-model" in ${tag} (via ${s1.via}): ${JSON.stringify(g1.value).slice(0, 200)}`);
          }
          // ripristino defaults best-effort
          if (defaults && typeof defaults === 'object') {
            tryCall(setE, [[QGUILD, defaults], [QGUILD, {}]]);
          } else {
            const clr = (ac && typeof ac.clear === 'function') ? ac.clear : (typeof ac.reset === 'function' ? ac.reset : null);
            if (clr) { try { clr(QGUILD); } catch {} }
          }
        }
      }
    }
  } catch (e) {
    fail(`aiConfig (qatest): ${e.message.split('\n')[0]}`);
  }

  // jobs/ticketAutoclose — require-safe (NON avvia timer: niente start/checkOnce qui)
  try {
    const candidates = ['src/jobs/ticketAutoclose.js', 'src/utils/ticketAutoclose.js', 'src/handlers/ticketAutoclose.js'];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('ticketAutoclose', 'src/jobs/ticketAutoclose.js (o utils/handlers)');
    } else {
      delete require.cache[require.resolve(found)];
      const ta = require(found);
      if (!ta || (typeof ta !== 'object' && typeof ta !== 'function')) {
        fail(`ticketAutoclose: export non valido (${path.relative(ROOT, found)})`);
      } else {
        for (const fn of ['checkOnce', 'startTicketAutoclose', 'setAutoClose']) {
          if (typeof ta[fn] !== 'function') warn(`ticketAutoclose: export "${fn}" mancante (${path.relative(ROOT, found)})`);
        }
        if (typeof ta.setAutoClose === 'function') {
          const { getConfig } = require(path.join(DB_DIR, 'tickets.js'));
          ta.setAutoClose(QGUILD, 7);
          if (getConfig(QGUILD).autoCloseDays !== 7) fail('ticketAutoclose: setAutoClose(7) non riflesso in tickets config (qatest)');
          ta.setAutoClose(QGUILD, 0); // ripristina default (off)
        }
      }
    }
  } catch (e) {
    fail(`ticketAutoclose require-safe: ${e.message.split('\n')[0]}`);
  }

  // aiProviders — detection pura, nessuna rete
  try {
    const ap = require(path.join(ROOT, 'src', 'ai', 'aiProviders.js'));
    if (typeof ap.complete !== 'function' || typeof ap.detectProvider !== 'function') {
      fail('aiProviders: export complete/detectProvider mancanti');
    } else {
      if (ap.detectProvider({}).name !== 'pollinations') fail('aiProviders: env vuoto atteso pollinations');
      if (ap.detectProvider({ OPENAI_API_KEY: 'sk-x' }).name !== 'openai') fail('aiProviders: OPENAI_API_KEY atteso openai');
      if (ap.detectProvider({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'k' }).name !== 'groq') fail('aiProviders: AI_PROVIDER=groq atteso groq');
      let threw = false;
      try { ap.detectProvider({ AI_PROVIDER: 'pippo' }); } catch (e2) { threw = !!e2.code; }
      if (!threw) fail('aiProviders: provider ignoto dovrebbe lanciare con code');
      const st = ap.activeProvider({});
      if (!st || st.name !== 'pollinations') fail('aiProviders: activeProvider({}) atteso pollinations');
    }
  } catch (e) {
    fail(`aiProviders: ${e.message.split('\n')[0]}`);
  }

  // codebase — indice + lettura sicura, solo letture
  try {
    const cb = require(path.join(ROOT, 'src', 'utils', 'codebase.js'));
    const tree = cb.buildTree();
    if (!tree || tree.total < 50 || tree.commands < 50) fail('codebase: buildTree con conteggi sospetti');
    let blocked = 0;
    for (const bad of ['../../.env', '/etc/passwd', 'src/../.env']) {
      try { cb.readFile(bad); } catch { blocked += 1; }
    }
    if (blocked !== 3) fail('codebase: path traversal non bloccato');
    const hits = cb.searchCode('cooldown', 3);
    if (!Array.isArray(hits) || !hits.length) fail('codebase: searchCode(cooldown) vuoto');
  } catch (e) {
    fail(`codebase: ${e.message.split('\n')[0]}`);
  }

  // selfImprove — validazione e scheduling puri (mai runOnce qui: scriverebbe journal/file)
  try {
    const si = require(path.join(ROOT, 'src', 'jobs', 'selfImprove.js'));
    for (const fn of ['runOnce', 'startSelfImprove', 'validateProposal', 'msUntilNext', 'lastRun']) {
      if (typeof si[fn] !== 'function') fail(`selfImprove: export "${fn}" mancante`);
    }
    const day = new Date('2026-01-01T10:00:00').getTime();
    if (si.msUntilNext('22:00', day) !== 12 * 3600 * 1000) fail('selfImprove: msUntilNext 12h errato');
    const fc = new Map([['src/commands/fun/dice.js', 'const a = 1;\n']]);
    const good = si.validateProposal({ file: 'src/commands/fun/dice.js', oldString: 'const a = 1;', newString: 'const a = 2;', reason: 't' }, fc);
    if (!good.ok) fail('selfImprove: validateProposal rifiuta patch valida');
    const evil = si.validateProposal({ file: 'src/commands/fun/dice.js', oldString: 'const a = 1;', newString: 'eval(x)', reason: 't' }, fc);
    if (evil.ok) fail('selfImprove: validateProposal accetta eval()');
    const out = si.validateProposal({ file: 'src/events/ready.js', oldString: 'x', newString: 'y', reason: 't' }, fc);
    if (out.ok) fail('selfImprove: validateProposal accetta file fuori allowlist');
  } catch (e) {
    fail(`selfImprove: ${e.message.split('\n')[0]}`);
  }

  // brain — cervello Obsidian (skills/memorie/file/kernel), tutto in dir tmp isolata nel repo
  try {
    const brainTmp = path.join(ROOT, `.brain-qa-${process.pid}`);
    fs.mkdirSync(brainTmp, { recursive: true });
    process.env.BRAIN_DIR = brainTmp;
    try {
      const bskills = require(path.join(ROOT, 'src', 'ai', 'brain', 'skills.js'));
      const bmem = require(path.join(ROOT, 'src', 'ai', 'brain', 'memory.js'));
      const bfiles = require(path.join(ROOT, 'src', 'ai', 'brain', 'files.js'));
      const kernel = require(path.join(ROOT, 'src', 'ai', 'brain', 'kernel.js'));
      const G = 'qatest-brain';
      if (bskills.listSkills(G).filter((s) => s.scope === 'global').length < 3) fail('brain: seed skill globali mancanti');
      bskills.saveSkill(G, { name: 'qa-regole', description: 'd', triggers: 'regole, warn', instructions: 'i' });
      if (!bskills.matchSkills(G, 'quali regole e warn?', 5).some((s) => s.name === 'qa-regole')) fail('brain: matchSkills non trova skill');
      bskills.setEnabled(G, 'qa-regole', false);
      if (bskills.matchSkills(G, 'qa-regole', 5).some((s) => s.name === 'qa-regole')) fail('brain: skill disattivata ancora matchata');
      if (bskills.removeSkill(G, 'qa-regole') !== true) fail('brain: removeSkill');
      try { bskills.saveSkill(G, { name: '__proto__', description: 'x', triggers: '', instructions: 'x' }); fail('brain: __proto__ accettato'); } catch {}
      bmem.saveNote(G, 'Qa Orari', 'Apertura [[qa sera]] #test', []);
      bmem.saveNote(G, 'Qa Sera', 'serata quiz', []);
      const back = bmem.getNote(G, 'Qa Sera');
      if (!back || !back.backlinks.includes('Qa Orari')) fail('brain: backlinks mancanti');
      if (!bmem.searchNotes(G, 'apertura serale', 3).length) fail('brain: searchNotes vuoto (prefix sera/serale)');
      bfiles.saveFile(G, 'qa-regole.txt', Buffer.from('niente spam'));
      if (!bfiles.matchFiles(G, 'regole spam', 2).length) fail('brain: matchFiles vuoto');
      try { bfiles.saveFile(G, '../../x.txt', Buffer.from('x')); fail('brain: traversal accettato'); } catch {}
      try { bfiles.saveFile(G, 'x.exe', Buffer.from('x')); fail('brain: estensione exe accettata'); } catch {}
      const ctx = kernel.buildContext({ guildId: G, query: 'a che ora aprite la sera?' });
      if (!ctx.sources.some((s) => s.type === 'memoria')) fail('brain: kernel senza memorie');
      if (kernel.buildContext({ guildId: G, query: 'x', budget: 200 }).system.length > 600) fail('brain: budget sforato');
      bmem.deleteNote(G, 'Qa Orari'); bmem.deleteNote(G, 'Qa Sera'); bfiles.deleteStored(G, 'qa-regole.txt');
    } finally {
      delete process.env.BRAIN_DIR;
      fs.rmSync(brainTmp, { recursive: true, force: true });
    }
  } catch (e) {
    fail(`brain: ${e.message.split('\n')[0]}`);
  }

  // compendio — memoria del self-improvement (principi + lezioni + prune)
  try {
    const brainTmp2 = path.join(ROOT, `.brain-qa2-${process.pid}`);
    fs.mkdirSync(brainTmp2, { recursive: true });
    process.env.BRAIN_DIR = brainTmp2;
    try {
      const comp = require(path.join(ROOT, 'src', 'ai', 'brain', 'compendio.js'));
      if (comp.getPrincipi() !== comp.getPrincipi()) fail('compendio: seed principi instabile');
      const id1 = comp.recordLesson({ verdict: 'applied', file: 'qatest.js', reason: 'qa lezione', detail: '' });
      if (!id1) fail('compendio: recordLesson non ritorna id');
      if (comp.recordLesson({ verdict: 'applied', file: 'qatest.js', reason: 'qa lezione', detail: '' }) !== null) {
        fail('compendio: lezione duplicata non scartata');
      }
      if (!comp.listLessons(10).some((l) => l.id === id1 && l.tipo === 'successo')) fail('compendio: listLessons senza la lezione');
      const ctx = comp.loadContext(3000);
      if (!ctx.includes('PRINCIPI') || ctx.length > 3100) fail('compendio: loadContext malformato/non cappato');
      for (let i = 0; i < 55; i += 1) {
        comp.recordLesson({ verdict: 'applied', file: `qa${i}.js`, reason: `qa prune ${i}`, detail: '' });
      }
      if (comp.listLessons(100).length !== 50) fail('compendio: prune non a 50');
    } finally {
      delete process.env.BRAIN_DIR;
      fs.rmSync(brainTmp2, { recursive: true, force: true });
    }
  } catch (e) {
    fail(`compendio: ${e.message.split('\n')[0]}`);
  }

  // ---- (c4) LOTTO roadmap QA: cases, customCommands, shop-riuso, store,
  //      logger, i18n+locales, backup, music ----
  // Policy: assente -> WARNING (skip, lavori in corso); API incompleta ->
  // WARNING (WIP); presente ma roundtrip/require rotto -> FAIL. Mai
  // execute() di comandi, mai start di job/timer, mai soldi veri, mai
  // scritture fuori chiavi qatest_*. Cleanup via scrubTestKeys/finally
  // sotto (chiave qatest_guild). Regola duplicati-evento NON toccata.
  console.log('---- (c4) Lotto roadmap QA (cases, customCommands, store, logger, i18n, backup, music) ----');

  // shop: roundtrip già coperto in (c3) sopra — riuso, nessun duplicato.
  try {
    if (!fs.existsSync(path.join(DB_DIR, 'shop.js'))) {
      skipMissing('shop (riuso)', 'src/database/shop.js');
    } else {
      console.log('shop: roundtrip già coperto in (c3) — riuso, nessun duplicato');
    }
  } catch (e) {
    fail(`shop riuso (qatest): ${e.message.split('\n')[0]}`);
  }

  // cases — hook moderazione (ban/kick/timeout/unban/warn + /caso).
  try {
    const fp = path.join(DB_DIR, 'cases.js');
    if (!fs.existsSync(fp)) {
      skipMissing('cases', 'src/database/cases.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const cs = require(fp);
      const need = ['logCase', 'getCase', 'getUserCases', 'addNote', 'removeCase', 'searchCases'];
      const miss = need.filter((fn) => typeof cs[fn] !== 'function');
      if (miss.length) {
        fail(`cases: export mancanti: ${miss.join(', ')}`);
      } else {
        const entry = cs.logCase(QGUILD, { type: 'warn', userId: QUSER, modId: QUSER, reason: 'qa smoke' });
        if (!entry || entry.id === undefined || entry.id === null) {
          fail('cases: logCase(qatest) non ritorna {id,...}');
        } else {
          const eid = String(entry.id);
          const got = cs.getCase(QGUILD, eid);
          if (!got || got.userId !== QUSER) fail('cases: getCase(qatest) non ritorna il caso salvato');
          if (!cs.getUserCases(QGUILD, QUSER).some((c) => String(c.id) === eid)) fail('cases: getUserCases non contiene il caso qatest');
          if (!cs.searchCases(QGUILD, { userId: QUSER }).some((c) => String(c.id) === eid)) fail('cases: searchCases(userId) non contiene il caso qatest');
          const n1 = cs.addNote(QGUILD, { userId: QUSER, modId: QUSER, reason: 'qa nota obj' });
          if (!n1 || n1.type !== 'note' || n1.id === undefined) fail('cases: addNote(obj) non ritorna nota con id');
          else if (cs.removeCase(QGUILD, n1.id) !== true) fail('cases: removeCase(nota obj) atteso true');
          const n2 = cs.addNote(QGUILD, QUSER, { modId: QUSER, reason: 'qa nota args' });
          if (!n2 || n2.type !== 'note' || n2.id === undefined) fail('cases: addNote(userId, opts) non ritorna nota con id');
          else if (cs.removeCase(QGUILD, n2.id) !== true) fail('cases: removeCase(nota args) atteso true');
          if (cs.removeCase(QGUILD, eid) !== true) fail('cases: removeCase(id valido) atteso true');
          if (cs.getCase(QGUILD, eid) !== null) fail('cases: dopo removeCase atteso null');
        }
        if (cs.logCase(QGUILD, { type: 'warn' }) !== null) fail('cases: logCase senza userId dovrebbe ritornare null (mai lanciare)');
        if (cs.removeCase(QGUILD, 'qatest_inesistente') !== false) fail('cases: removeCase(id ignoto) atteso false');
      }
    }
  } catch (e) {
    fail(`cases (qatest): ${e.message.split('\n')[0]}`);
  }

  // customCommands — comandi custom per-guild (roundtrip adattivo: il nome
  // file/funzioni dipende dall'agente; assente/incompleto -> skip, rotto -> FAIL).
  try {
    const candidates = [
      'src/database/customCommands.js',
      'src/database/customcommands.js',
      'src/utils/customCommands.js',
    ];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('customCommands', 'src/database/customCommands.js');
    } else {
      delete require.cache[require.resolve(found)];
      const cc = require(found);
      const tag = path.relative(ROOT, found);
      const pick = (...names) => {
        for (const n of names) if (cc && typeof cc[n] === 'function') return { fn: cc[n].bind(cc), name: n };
        return null;
      };
      const setE = pick('addCommand', 'setCommand', 'createCommand', 'upsertCommand', 'registerCommand', 'add', 'set', 'create', 'upsert', 'register');
      const getE = pick('getCommand', 'get', 'find', 'findCommand', 'listCommands', 'list');
      const delE = pick('removeCommand', 'deleteCommand', 'remove', 'delete', 'clear', 'reset', 'clearCommands');
      if (!setE || !getE) {
        warn(`customCommands: API incompleta in ${tag} (set=${setE ? setE.name : '-'}/get=${getE ? getE.name : '-'}/del=${delE ? delE.name : '-'}; exports: ${cc && typeof cc === 'object' ? Object.keys(cc).sort().join(',') : typeof cc}) — skip (WIP)`);
      } else {
        // NOTA nomi: customCommands valida /^[a-z0-9-]{2,20}$/ (niente
        // underscore): si usa 'qatest-cmd' con hyphen, comunque tracciabile.
        const QCMD = 'qatest-cmd';
        const ccTry = (entry, argsList) => {
          let lastErr = null;
          for (const args of argsList) {
            try {
              return { ok: true, value: entry.fn(...args), via: `${entry.name}(${args.length})` };
            } catch (e) { lastErr = e; }
          }
          return { ok: false, error: lastErr };
        };
        try { if (delE) delE.fn(QGUILD, QCMD); } catch { /* best-effort */ }
        const setR = ccTry(setE, [
          [QGUILD, QCMD, 'qatest pong'],
          [QGUILD, QCMD, { response: 'qatest pong' }],
          [QGUILD, { name: QCMD, response: 'qatest pong' }],
        ]);
        if (!setR.ok) {
          fail(`customCommands: set fallito in ogni forma (qatest) in ${tag}: ${(setR.error && setR.error.message || '?').split('\n')[0]}`);
        } else if (setR.value && setR.value.ok === false) {
          fail(`customCommands: set rifiutato dal modulo in ${tag} (via ${setR.via}): ${setR.value.error || 'ok:false'}`);
        } else {
          const getR = ccTry(getE, [[QGUILD, QCMD], [QGUILD]]);
          if (!getR.ok) fail(`customCommands: get fallito (qatest) in ${tag}: ${(getR.error && getR.error.message || '?').split('\n')[0]}`);
          else if (JSON.stringify(getR.value || '').indexOf('qatest') === -1) {
            fail(`customCommands: get senza traccia qatest dopo set in ${tag} (via ${getR.via}): ${JSON.stringify(getR.value).slice(0, 160)}`);
          }
          if (delE) {
            ccTry(delE, [[QGUILD, QCMD], [QGUILD]]);
            const after = ccTry(getE, [[QGUILD, QCMD], [QGUILD]]);
            if (after.ok && JSON.stringify(after.value || '').indexOf('qatest') !== -1) {
              fail(`customCommands: dopo delete ancora traccia qatest in ${tag}: ${JSON.stringify(after.value).slice(0, 160)}`);
            }
          } else {
            warn(`customCommands: export delete assente in ${tag} — cleanup via scrubTestKeys/finally`);
          }
        }
        try { if (delE) delE.fn(QGUILD, QCMD); } catch { /* best-effort */ }
      }
    }
  } catch (e) {
    fail(`customCommands (qatest): ${e.message.split('\n')[0]}`);
  }

  // store.js — require-safe: collection qatest set/get su backend json;
  // sqlite SOLO se node:sqlite disponibile, altrimenti warning.
  try {
    const fp = path.join(DB_DIR, 'store.js');
    if (!fs.existsSync(fp)) {
      skipMissing('store', 'src/database/store.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const st = require(fp);
      const tag = 'src/database/store.js';
      if (!st || (typeof st !== 'object' && typeof st !== 'function')) {
        fail(`store: export non valido (${tag})`);
      } else {
        const pick = (...names) => {
          for (const n of names) if (typeof st[n] === 'function') return { fn: st[n].bind(st), name: n };
          return null;
        };
        let sqliteOk = false;
        try { require('node:sqlite'); sqliteOk = true; } catch { sqliteOk = false; }
        if (!sqliteOk) warn('store: node:sqlite non disponibile — backend sqlite non testato (solo json)');
        const filesBefore = new Set(fs.readdirSync(DB_DIR));
        const QKEY = 'qatest_key';
        const QVAL = { v: 'qatest', n: 42 };
        let didRoundtrip = false;
        const colE = pick('collection', 'getCollection', 'col');
        if (colE) {
          // Forma collection-style: st.collection('qatest').set/get/delete.
          try {
            const c = colE.fn('qatest');
            if (!c || typeof c.set !== 'function' || typeof c.get !== 'function') {
              warn(`store: collection('qatest') senza set/get in ${tag} — skip (WIP)`);
            } else {
              c.set(QKEY, QVAL);
              if (JSON.stringify(c.get(QKEY)) !== JSON.stringify(QVAL)) {
                fail('store: collection(qatest) get/set roundtrip fallito (json)');
              }
              didRoundtrip = true;
              if (typeof c.delete === 'function') c.delete(QKEY);
              else if (typeof c.remove === 'function') c.remove(QKEY);
              else if (typeof c.clear === 'function') c.clear();
              const after = c.get(QKEY);
              if (after !== undefined && after !== null) fail('store: collection(qatest) dopo delete atteso undefined/null');
            }
          } catch (e) {
            fail(`store: collection(qatest) roundtrip (json): ${e.message.split('\n')[0]}`);
            didRoundtrip = true;
          }
        } else {
          // Forma kv-style: st.set/get(ns, key, value).
          const setE = pick('set', 'put', 'save', 'upsert');
          const getE = pick('get', 'fetch', 'load');
          const delE = pick('delete', 'del', 'remove', 'clear');
          if (!setE || !getE) {
            warn(`store: API incompleta in ${tag} (set=${setE ? setE.name : '-'}/get=${getE ? getE.name : '-'}; exports: ${Object.keys(st).sort().join(',')}) — skip (WIP)`);
          } else {
            const shapes = [
              { label: 'ns3', sArgs: ['qatest', QKEY, QVAL], gArgs: ['qatest', QKEY] },
              { label: 'flat', sArgs: [`qatest_${QKEY}`, QVAL], gArgs: [`qatest_${QKEY}`] },
            ];
            let used = null;
            for (const sh of shapes) {
              try {
                setE.fn(...sh.sArgs);
                if (JSON.stringify(getE.fn(...sh.gArgs)) === JSON.stringify(QVAL)) { used = sh; break; }
                try { if (delE) delE.fn(...sh.gArgs); } catch { /* best-effort */ }
              } catch { /* forma non supportata: prova la prossima */ }
            }
            if (!used) {
              warn(`store: nessuna forma set/get riconosciuta in ${tag} (set=${setE.name}/get=${getE.name}) — skip (WIP, contratto ignoto)`);
            } else {
              didRoundtrip = true;
              try {
                if (delE) delE.fn(...used.gArgs);
                else warn(`store: export delete assente in ${tag} — cleanup via scrubTestKeys/finally`);
                const after = getE.fn(...used.gArgs);
                if (after !== undefined && after !== null) fail(`store: dopo delete atteso undefined/null (via ${used.label})`);
              } catch (e) {
                fail(`store: cleanup qatest (${used.label}): ${e.message.split('\n')[0]}`);
              }
            }
          }
        }
        if (sqliteOk && didRoundtrip) {
          let srcHead = '';
          try { srcHead = fs.readFileSync(fp, 'utf8').slice(0, 4000); } catch { /* best-effort */ }
          if (!/sqlite/i.test(Object.keys(st).join(' ')) && !/sqlite/i.test(srcHead)) {
            warn('store: backend sqlite non esposto via API — verificato solo json (ok)');
          }
        }
        // Artefatti NUOVI (*.json/*.db/*.sqlite) con tracce qatest = miei:
        // rimuovi. Solo queste estensioni: MAI toccare .js altrui.
        for (const f of fs.readdirSync(DB_DIR)) {
          if (filesBefore.has(f)) continue;
          if (!/\.(json|db|sqlite|sqlite-journal)$/.test(f)) continue;
          const full = path.join(DB_DIR, f);
          let raw = '';
          try { raw = fs.readFileSync(full, 'utf8'); } catch { continue; }
          if (raw.includes('qatest')) {
            try {
              fs.rmSync(full, { force: true });
              warn(`store: rimosso artefatto di test ${path.relative(ROOT, full)}`);
            } catch (e) {
              fail(`store: artefatto di test non rimovibile ${path.relative(ROOT, full)}: ${e.message}`);
            }
          }
        }
      }
    }
  } catch (e) {
    fail(`store (qatest): ${e.message.split('\n')[0]}`);
  }

  // logger.js — require-safe: scrive su LOG_DIR tmp, cleanup (mai crashare).
  try {
    const fp = path.join(ROOT, 'src', 'utils', 'logger.js');
    if (!fs.existsSync(fp)) {
      skipMissing('logger', 'src/utils/logger.js');
    } else {
      const prevLogDir = process.env.LOG_DIR;
      const prevLogLevel = process.env.LOG_LEVEL;
      const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'smoke-log-'));
      const realLog = console.log;
      const realWarn = console.warn;
      const realErr = console.error;
      try {
        process.env.LOG_DIR = tmpDir;
        process.env.LOG_LEVEL = 'debug';
        console.log = () => {};
        console.warn = () => {};
        console.error = () => {};
        delete require.cache[require.resolve(fp)];
        const lg = require(fp);
        const api = (lg && (lg.logger || lg.default)) || lg;
        for (const fn of ['debug', 'info', 'warn', 'error']) {
          if (typeof api[fn] !== 'function') fail(`logger: metodo "${fn}" mancante`);
        }
        api.info('qa smoke', { guild: QGUILD });
        api.warn({ msg: 'qa warn', k: 'qatest' });
        api.error(new Error('qa error'));
        api.debug('qa debug');
        if (typeof api.child === 'function') api.child({ mod: 'qa' }).info('qa child');
        if (typeof lg.logCommand === 'function') lg.logCommand(QGUILD, QUSER, 'qatest', 12);
        const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.log'));
        if (!files.length) {
          fail('logger: nessun file .log scritto su LOG_DIR tmp (qatest)');
        } else {
          const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf8');
          if (content.indexOf('qa smoke') === -1 && content.indexOf('qa warn') === -1) {
            fail('logger: record qatest non trovato nel .log tmp');
          }
          for (const ln of content.trim().split('\n').filter(Boolean)) {
            try {
              JSON.parse(ln);
            } catch {
              fail('logger: riga non JSON-lines nel .log tmp');
              break;
            }
          }
        }
      } finally {
        console.log = realLog;
        console.warn = realWarn;
        console.error = realErr;
        if (prevLogDir === undefined) delete process.env.LOG_DIR;
        else process.env.LOG_DIR = prevLogDir;
        if (prevLogLevel === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = prevLogLevel;
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    fail(`logger (qatest): ${e.message.split('\n')[0]}`);
  }

  // i18n.js + locales — require-safe: t() con fallback (mai undefined).
  try {
    const fp = path.join(ROOT, 'src', 'utils', 'i18n.js');
    if (!fs.existsSync(fp)) {
      skipMissing('i18n', 'src/utils/i18n.js');
    } else {
      delete require.cache[require.resolve(fp)];
      let iu = null;
      try {
        iu = require(fp);
      } catch (e) {
        fail(`i18n: require fallito (locales mancanti?): ${e.message.split('\n')[0]}`);
      }
      if (iu) {
        if (typeof iu.t !== 'function') {
          fail('i18n: export "t" mancante');
        } else {
          if (iu.t('qatest.chiave.mai.esistente', 'it') !== 'qatest.chiave.mai.esistente') {
            fail('i18n: t(chiave ignota, it) dovrebbe ritornare la chiave stessa');
          }
          if (iu.t('qatest.chiave.mai.esistente', 'en') !== 'qatest.chiave.mai.esistente') {
            fail('i18n: t(chiave ignota, en) dovrebbe ritornare la chiave stessa (fallback)');
          }
          try {
            delete require.cache[require.resolve(path.join(ROOT, 'src', 'locales', 'it.js'))];
            const itLoc = require(path.join(ROOT, 'src', 'locales', 'it.js'));
            const findStr = (obj, prefix) => {
              for (const [k, v] of Object.entries(obj)) {
                const key = prefix ? `${prefix}.${k}` : k;
                if (typeof v === 'string') return { key, val: v };
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  const r = findStr(v, key);
                  if (r) return r;
                }
              }
              return null;
            };
            const first = findStr(itLoc, '');
            if (!first) {
              warn('i18n: src/locales/it.js senza stringhe — fallback non verificabile');
            } else if (iu.t(first.key, 'it') !== first.val) {
              fail(`i18n: t('${first.key}', 'it') non ritorna la stringa attesa`);
            }
          } catch (e) {
            warn(`i18n: src/locales/it.js non caricato — fallback reale non verificabile (${e.message.split('\n')[0]})`);
          }
        }
        if (typeof iu.getLang === 'function') {
          if (iu.getLang(null) !== 'it' || iu.getLang(undefined) !== 'it') {
            fail('i18n: getLang(null/DM) atteso "it"');
          }
        }
        if (typeof iu.setLang === 'function' && typeof iu.getLang === 'function') {
          let threw = false;
          try { iu.setLang(QGUILD, 'xx-bogus'); } catch { threw = true; }
          if (!threw) fail('i18n: setLang(lingua bogus) dovrebbe lanciare');
          else {
            iu.setLang(QGUILD, 'en'); // solo chiave qatest (cleanup via scrub/finally)
            if (iu.getLang(QGUILD) !== 'en') fail('i18n: setLang(qatest, en)/getLang roundtrip fallito');
            iu.setLang(QGUILD, 'it'); // ripristina (scrub rimuove comunque la chiave)
          }
        }
      }
    }
  } catch (e) {
    fail(`i18n (qatest): ${e.message.split('\n')[0]}`);
  }

  // backup.js — require-safe: MAI start, solo export check + no auto-start.
  try {
    const candidates = ['src/jobs/backup.js', 'src/utils/backup.js'];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('backup', 'src/jobs/backup.js');
    } else {
      delete require.cache[require.resolve(found)];
      const bk = require(found);
      const tag = path.relative(ROOT, found);
      if (!bk || (typeof bk !== 'object' && typeof bk !== 'function')) {
        fail(`backup: export non valido (${tag})`);
      } else {
        const fns = Object.keys(bk).filter((k) => typeof bk[k] === 'function');
        if (!fns.length) fail(`backup: nessun export funzione in ${tag} (atteso almeno create/backup/run/start)`);
        else {
          // MAI avviare qui (niente start/run/schedule): solo export check +
          // euristica no auto-start a top-level (colonna 0, fuori funzioni).
          let raw = '';
          try { raw = fs.readFileSync(found, 'utf8'); } catch {}
          const lines = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
            .map((ln) => ln.replace(/\/\/.*$/, ''));
          const auto = lines.filter((ln) => /^(setInterval|setTimeout)\s*\(/.test(ln)
            || /^(start|run|init|schedule|startBackup|runBackup|createBackup|scheduleBackup)\s*\(/.test(ln));
          if (auto.length) {
            fail(`backup: auto-start a top-level in ${tag} (mai avviare al require: ${auto[0].trim().slice(0, 80)})`);
          } else {
            console.log(`backup: export check OK (${tag}: ${fns.sort().join(', ')}) — mai avviato`);
          }
        }
      }
    }
  } catch (e) {
    fail(`backup require-safe: ${e.message.split('\n')[0]}`);
  }

  // comandi music — require-safe ANCHE senza dipendenze vocali.
  // Se un comando lancia al require per discord-player/@discordjs/voice
  // mancanti -> FAIL con messaggio chiaro (devono usare require lazy o
  // try/catch con messaggio utente, mai rompere l'avvio del bot/smoke).
  try {
    const musicDirs = ['src/commands/music', 'src/commands/musica']
      .map((d) => path.join(ROOT, d))
      .filter((d) => fs.existsSync(d));
    if (!musicDirs.length) {
      skipMissing('music', 'src/commands/music');
    } else {
      const VOCAL_RE = /discord-player|@discordjs\/voice|play-dl|ytdl|yt-search|sodium|opusscript|prism-media|ffmpeg|@discordjs\/opus/;
      const files = musicDirs.flatMap((d) => collectJs(d, true));
      if (!files.length) {
        warn('music: directory presente ma senza file .js — skip');
      }
      for (const file of files) {
        const r = rel(file);
        try {
          delete require.cache[require.resolve(file)];
          const mod = require(file);
          if (!mod || typeof mod !== 'object') fail(`${r} (music): export non è un oggetto`);
        } catch (e) {
          const msg = String((e && e.message) || e);
          if (e.code === 'MODULE_NOT_FOUND' && VOCAL_RE.test(msg)) {
            fail(`${r} (music): richiede dipendenza vocale a TOP-LEVEL senza fallback (${msg.split('\n')[0]}) — i comandi music DEVONO caricarsi anche senza discord-player/@discordjs/voice (require lazy in execute() o try/catch)`);
          } else {
            fail(`${r} (music): require fallito: ${msg.split('\n')[0]}`);
          }
          continue;
        }
        try {
          const srcM = fs.readFileSync(file, 'utf8');
          const codeM = srcM.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
            .map((ln) => ln.replace(/\/\/.*$/, ''));
          const eager = codeM.filter((ln) => /^(const|let|var)\s+.*require\(\s*['"][^'"]*(discord-player|@discordjs\/voice|play-dl|ytdl-core)[^'"]*['"]\s*\)/.test(ln));
          if (eager.length) {
            fail(`${r} (music): require vocale EAGER a top-level (${eager.length} occorrenze) — deve essere lazy dentro execute() o protetto da try/catch, altrimenti il bot non parte senza dipendenze vocali`);
          }
        } catch { /* best-effort: la scansione non deve mai rompere lo smoke */ }
      }
    }
  } catch (e) {
    fail(`music require-safe: ${e.message.split('\n')[0]}`);
  }

  // ---- (c5) LOTTO QA: theme, env, backup-restore, aiUsage (music riuso c4) ----
  // Policy: assente -> WARNING (skip, lavori in corso); API incompleta ->
  // WARNING (WIP); presente ma roundtrip/require rotto -> FAIL. Mai
  // execute() di comandi, mai start di job/timer, mai restore veri su dati
  // reali (backup: SOLO dir tmp isolate). Cleanup qatest/w1test/gtest via
  // scrubTestKeys/finally sotto. Regola duplicati-evento NON toccata.
  console.log('---- (c5) Lotto QA (theme, env, backup-restore, aiUsage) ----');

  // theme.js — contratto export completo + pure functions (paginate è async
  // con I/O Discord: qui solo sync-check — export async, thenable, mai throw
  // in sync — mai veri invii).
  try {
    const fp = path.join(ROOT, 'src', 'utils', 'theme.js');
    if (!fs.existsSync(fp)) {
      skipMissing('theme', 'src/utils/theme.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const th = require(fp);
      const tag = 'src/utils/theme.js';
      const need = ['COLORS', 'ok', 'err', 'info', 'applyFooter', 'bar', 'medal', 'num', 'truncate', 'paginate'];
      const miss = need.filter((k) => th[k] === undefined);
      if (miss.length) {
        fail(`theme: export mancanti: ${miss.join(', ')} (${tag})`);
      } else {
        for (const c of ['primary', 'success', 'error']) {
          if (typeof th.COLORS[c] !== 'number') fail(`theme: COLORS.${c} atteso numero in ${tag}`);
        }
        const { EmbedBuilder } = require('discord.js');
        const col = (e) => { try { return e.toJSON().color; } catch { return undefined; } };
        if (col(th.ok('t', 'd')) !== th.COLORS.success) fail('theme: ok() senza color success');
        if (col(th.err('x')) !== th.COLORS.error) fail('theme: err() senza color error');
        if (col(th.info('t', 'd')) !== th.COLORS.primary) fail('theme: info() senza color primary');
        if (th.ok('x'.repeat(300), 'd').toJSON().title.length > 256) fail('theme: ok() non tronca il titolo a 256');
        const e0 = new EmbedBuilder().setDescription('base');
        if (th.applyFooter(e0, { user: { tag: 'QA' } }) !== e0) fail('theme: applyFooter deve ritornare lo stesso embed');
        if (!JSON.stringify(e0.toJSON()).includes('QA')) fail('theme: applyFooter senza footer "Richiesto da QA"');
        if (th.bar(5, 10, 10) !== '█'.repeat(5) + '░'.repeat(5)) fail('theme: bar(5,10,10) errata');
        if (th.bar(1, 0) !== '░'.repeat(10)) fail('theme: bar(1,0) deve essere sicura su div0');
        if (th.bar(-5, 10) !== '░'.repeat(10)) fail('theme: bar negativa deve clampare a 0');
        if (th.medal(0) !== '🥇' || th.medal(1) !== '🥈' || th.medal(2) !== '🥉') fail('theme: medal podio errate');
        if (!String(th.medal(5)).includes('6')) fail('theme: medal(5) atteso posizione 6');
        if (typeof th.num(1234) !== 'string') fail('theme: num(1234) atteso stringa');
        if (th.num(NaN) !== 'n/d') fail("theme: num(NaN) atteso 'n/d'");
        if (th.truncate('abcdef', 3) !== 'abc') fail("theme: truncate('abcdef',3) atteso 'abc'");
        if (th.truncate(123, 10) !== '123') fail('theme: truncate(123,10) deve tollerare non-stringhe');
        if (th.paginate.constructor.name !== 'AsyncFunction') fail('theme: paginate atteso async function');
        let p = null;
        try {
          p = th.paginate(null, []);
        } catch (e) {
          fail(`theme: paginate(null,[]) non deve lanciare in sync: ${e.message.split('\n')[0]}`);
        }
        if (p && typeof p.then === 'function') p.then(() => {}, () => {});
        else if (p !== null) fail('theme: paginate(null,[]) atteso Promise/null, mai valore sync');
      }
    }
  } catch (e) {
    fail(`theme (contratto): ${e.message.split('\n')[0]}`);
  }

  // env.js — validateEnv: token mancante->errors, completo->ok (solo overrides, mai env reale).
  try {
    const fp = path.join(ROOT, 'src', 'utils', 'env.js');
    if (!fs.existsSync(fp)) {
      skipMissing('env', 'src/utils/env.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const ev = require(fp);
      const tag = 'src/utils/env.js';
      if (typeof ev.getEnv !== 'function' || typeof ev.validateEnv !== 'function') {
        fail(`env: export getEnv/validateEnv mancanti in ${tag}`);
      } else {
        const bad = ev.validateEnv({ DISCORD_TOKEN: '' });
        if (!bad || bad.ok !== false || !Array.isArray(bad.errors) || !bad.errors.length) {
          fail('env: validateEnv(token mancante) atteso {ok:false, errors:[...]}');
        }
        const good = ev.validateEnv({ DISCORD_TOKEN: 'qatest-token-123', CLIENT_ID: '123' });
        if (!good || good.ok !== true || (good.errors && good.errors.length)) {
          fail(`env: validateEnv(completo) atteso {ok:true, errors:[]} in ${tag}, ottenuto ${JSON.stringify(good).slice(0, 120)}`);
        }
        const cfg = ev.getEnv({ DISCORD_TOKEN: 'qatest-token-123' });
        if (!cfg || cfg.DISCORD_TOKEN !== 'qatest-token-123') fail('env: getEnv(overrides) non applica gli overrides');
      }
    }
  } catch (e) {
    fail(`env (validateEnv): ${e.message.split('\n')[0]}`);
  }

  // backup.js restore — MAI su dati reali: traversal rifiutato (puro) + roundtrip SOLO su dir tmp.
  try {
    const candidates = ['src/jobs/backup.js', 'src/utils/backup.js'];
    const found = candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f));
    if (!found) {
      skipMissing('backup-restore', 'src/jobs/backup.js');
    } else {
      delete require.cache[require.resolve(found)];
      const bk = require(found);
      const tag = path.relative(ROOT, found);
      if (typeof bk.restoreBackup !== 'function' || typeof bk.isValidBackupName !== 'function') {
        warn(`backup-restore: export restoreBackup/isValidBackupName assenti in ${tag} (exports: ${Object.keys(bk).sort().join(',')}) — skip (WIP)`);
      } else {
        for (const evil of ['../x', '..', '/etc/passwd', '', 'a/b', '2026-13-99-9999x']) {
          if (bk.isValidBackupName(evil)) fail(`backup: isValidBackupName accetta "${evil}" (traversal/malformato!)`);
        }
        if (!bk.isValidBackupName('2026-01-02-0300')) fail('backup: isValidBackupName rifiuta un nome valido YYYY-MM-DD-HHmm');
        const tmpRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'smoke-br-'));
        const tmpDb = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'smoke-db-'));
        try {
          const r1 = bk.restoreBackup('../evil', { backupRoot: tmpRoot, dbDir: tmpDb });
          if (!r1 || r1.ok !== false) fail('backup: restoreBackup(traversal) deve fallire con ok:false');
          const r2 = bk.restoreBackup('2026-01-02-0300', { backupRoot: tmpRoot, dbDir: tmpDb });
          if (!r2 || r2.ok !== false) fail('backup: restoreBackup(inesistente) atteso ok:false');
          const name = '2026-02-03-0300';
          fs.mkdirSync(path.join(tmpRoot, name), { recursive: true });
          fs.writeFileSync(path.join(tmpRoot, name, 'qatest_restore.json'), JSON.stringify({ v: 'qatest' }));
          const r3 = bk.restoreBackup(name, { backupRoot: tmpRoot, dbDir: tmpDb, now: 1700000000000 });
          if (!r3 || r3.ok !== true || !r3.restored.includes('qatest_restore.json')) {
            fail(`backup: restoreBackup roundtrip tmp fallito: ${JSON.stringify(r3).slice(0, 160)}`);
          } else {
            const back = JSON.parse(fs.readFileSync(path.join(tmpDb, 'qatest_restore.json'), 'utf8'));
            if (back.v !== 'qatest') fail('backup: restore tmp non ripristina il contenuto');
          }
          if (fs.existsSync(path.join(DB_DIR, 'qatest_restore.json'))) {
            fail('backup: restore ha scritto su dati reali (src/database/qatest_restore.json)!');
          }
        } finally {
          fs.rmSync(tmpRoot, { recursive: true, force: true });
          fs.rmSync(tmpDb, { recursive: true, force: true });
        }
        console.log(`backup-restore: export+traversal+roundtrip-tmp OK (${tag}) — mai toccati dati reali`);
      }
    }
  } catch (e) {
    fail(`backup-restore: ${e.message.split('\n')[0]}`);
  }

  // aiUsage.js — roundtrip con snapshot/restore del file reale (mai inquinare le metriche odierne).
  try {
    const fp = path.join(DB_DIR, 'aiUsage.js');
    if (!fs.existsSync(fp)) {
      skipMissing('aiUsage', 'src/database/aiUsage.js');
    } else {
      delete require.cache[require.resolve(fp)];
      const au = require(fp);
      const tag = 'src/database/aiUsage.js';
      if (typeof au.todayCount !== 'function' || typeof au.countCall !== 'function' || typeof au.todayKey !== 'function') {
        warn(`aiUsage: API incompleta in ${tag} (exports: ${Object.keys(au).sort().join(',')}) — skip (WIP)`);
      } else {
        const { dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
        const f = dbFile('aiUsage');
        const hadFile = fs.existsSync(f);
        const rawBefore = hadFile ? fs.readFileSync(f, 'utf8') : null;
        try {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(au.todayKey())) fail('aiUsage: todayKey() non è YYYY-MM-DD');
          const beforeCount = au.todayCount();
          const after = au.countCall();
          if (after !== beforeCount + 1) fail(`aiUsage: countCall atteso ${beforeCount + 1}, ottenuto ${after}`);
          // Persistenza verificata via raw (load ha side-effect: crea il file se manca).
          const rawMid = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
          if (!rawMid.includes(`"total": ${after}`) && !rawMid.includes(`"total":${after}`)) {
            fail('aiUsage: countCall non persistito su file');
          }
        } finally {
          try {
            if (rawBefore === null) fs.rmSync(f, { force: true });
            else fs.writeFileSync(f, rawBefore);
          } catch (e) {
            fail(`aiUsage: restore snapshot fallito: ${e.message.split('\n')[0]}`);
          }
        }
        // Verifica restore SENZA chiamare au.* (load ricreerebbe il file se assente): solo fs.
        try {
          if (rawBefore === null) {
            if (fs.existsSync(f)) {
              const leftover = fs.readFileSync(f, 'utf8').trim();
              if (leftover === '{}' || leftover === '') {
                fs.rmSync(f, { force: true }); // side-effect di load(): file vuoto ricreato, rimuovi
              } else {
                fail('aiUsage: dopo il restore il file dovrebbe essere assente');
              }
            }
          } else if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== rawBefore) {
            fail('aiUsage: dopo il restore il file non è identico allo snapshot');
          }
        } catch (e) {
          fail(`aiUsage: verifica restore: ${e.message.split('\n')[0]}`);
        }
      }
    }
  } catch (e) {
    fail(`aiUsage (roundtrip): ${e.message.split('\n')[0]}`);
  }

  // music: require-safe già coperto in (c4) sopra — riuso, nessun duplicato.
  try {
    const musicDirs = ['src/commands/music', 'src/commands/musica']
      .map((d) => path.join(ROOT, d))
      .filter((d) => fs.existsSync(d));
    if (!musicDirs.length) {
      skipMissing('music (riuso)', 'src/commands/music');
    } else {
      console.log('music: require-safe già coperto in (c4) — riuso, nessun duplicato');
    }
  } catch (e) {
    fail(`music riuso: ${e.message.split('\n')[0]}`);
  }
} finally {
  const touched = scrubTestKeys();
  console.log(`Cleanup chiavi qatest/w1test/gtest: ${touched.length ? touched.join(', ') : 'nessun file sporcato (ok)'}`);
  // Verifica: nessuna chiave qatest/w1test/gtest rimasta nei JSON
  try {
    const { load, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
    const jsonNames = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
    for (const name of jsonNames) {
      const f = dbFile(name);
      if (!fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, 'utf8');
      for (const marker of ['qatest', 'w1test', 'gtest']) {
        if (raw.includes(marker)) fail(`Cleanup incompleto: ${rel(f)} contiene ancora "${marker}"`);
      }
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
console.log('== [4/5] Collisioni cross-modulo ==');
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

// --------------------------------------- (f) Dashboard lotto (server + FE) ==
console.log('== [5/5] Dashboard lotto (server require-safe + contratto FE) ==');
let dashBootPromise = Promise.resolve();
try {
  // (f1) require-safe di src/dashboard/server.js SENZA express installato.
  // Se il file manca: WARNING (skip, lavori in corso).
  // Se require riesce: verifica export minimi (createApp/start o router).
  // Se require fallisce con MODULE_NOT_FOUND express: è OK (skip) SOLO se
  // express è richiesto in modo lazy (dentro funzione, non top-level);
  // verifica via sorgente, altrimenti FAIL (eager require romperebbe il bot).
  // Qualsiasi altro errore di require: FAIL.
  const dashServer = path.join(ROOT, 'src', 'dashboard', 'server.js');
  if (!fs.existsSync(dashServer)) {
    warn('dashboard/server: modulo non ancora presente (src/dashboard/server.js) — skip (lavori in corso)');
  } else {
    let loaded = null;
    let loadErr = null;
    try {
      delete require.cache[require.resolve(dashServer)];
      loaded = require(dashServer);
    } catch (e) {
      loadErr = e;
    }
    if (loadErr) {
      const msg = String((loadErr && loadErr.message) || loadErr);
      const isExpressMissing = loadErr.code === 'MODULE_NOT_FOUND' && /express/.test(msg);
      if (isExpressMissing) {
        // Verifica lazy: express deve essere required dentro una funzione.
        let src = '';
        try { src = fs.readFileSync(dashServer, 'utf8'); } catch {}
        const lines = src.split('\n');
        const topLevelExpress = lines.filter((ln) => /^\s{0,1}(const|let|var)\s+.*require\(\s*['"]express['"]\s*\)/.test(ln) && !/^\s{2,}/.test(ln));
        const anyExpress = /require\(\s*['"]express['"]\s*\)/.test(src);
        const lazyHint = /function\s+(createApp|start|init|buildApp)|createApp\s*=|=>\s*\{[^}]*require\(\s*['"]express['"]\s*\)|function[^{]*\{[\s\S]{0,2000}require\(\s*['"]express['"]\s*\)/.test(src);
        if (!anyExpress) {
          fail(`dashboard/server: MODULE_NOT_FOUND express ma sorgente senza require('express') — errore anomalo: ${msg.split('\n')[0]}`);
        } else if (topLevelExpress.length > 0) {
          fail(`dashboard/server: require('express') EAGER a top-level (${topLevelExpress.length} occorrenze) — deve essere lazy dentro createApp/start altrimenti rompe smoke/bot senza express: ${msg.split('\n')[0]}`);
        } else if (!lazyHint) {
          fail(`dashboard/server: express richiesto ma lazy non verificabile (nessuna createApp/function wrapper trovata) — rendilo lazy: ${msg.split('\n')[0]}`);
        } else {
          warn(`dashboard/server: skip require-safe (express non installato, lazy OK) — ${msg.split('\n')[0]}`);
        }
      } else {
        fail(`dashboard/server: require fallito (NON per express mancante): ${msg.split('\n')[0]}`);
      }
    } else if (!loaded || (typeof loaded !== 'object' && typeof loaded !== 'function')) {
      fail('dashboard/server: export non valido (atteso oggetto/funzione con createApp o start)');
    } else {
      const hasEntry = typeof loaded.createApp === 'function' || typeof loaded.start === 'function'
        || typeof loaded.startDashboard === 'function'
        || typeof loaded.init === 'function' || typeof loaded.buildApp === 'function';
      if (!hasEntry) warn(`dashboard/server: export senza createApp/startDashboard/start/init/buildApp (exports: ${Object.keys(loaded).sort().join(',') || '(nessuna)'})`);
      else console.log('dashboard/server: require-safe OK');
    }
  }

  // (f2) Contratto FE<->BE: src/dashboard/public/app.js via grep.
  // Se il file manca: WARNING (skip, lavori in corso).
  // Il FE costruisce gli URL per concatenazione
  // (es. "/api/guilds/" + encodeURIComponent(gid) + "/schema"), quindi:
  //  1. si spogliano i commenti (niente falsi positivi dal testo libero);
  //  2. solo literal su SINGOLA riga (niente match multi-linea);
  //  3. le righe con '+' vengono ricomposte in un template unico dove ogni
  //     espressione dinamica diventa :p, poi verificato contro il contratto.
  // Endpoint extra -> FAIL.
  // Contratto FE<->BE: scansiona app.js (legacy/stub) + tutti i public/js/*.js.
  // File candidati: app.js se contiene codice (oltre i commenti), più ogni js/*.js.
  const dashFiles = [];
  const dashApp = path.join(ROOT, 'src', 'dashboard', 'public', 'app.js');
  if (fs.existsSync(dashApp)) dashFiles.push(dashApp);
  const dashJsDir = path.join(ROOT, 'src', 'dashboard', 'public', 'js');
  if (fs.existsSync(dashJsDir)) {
    for (const f of fs.readdirSync(dashJsDir).filter((f) => f.endsWith('.js')).sort()) {
      dashFiles.push(path.join(dashJsDir, f));
    }
  }
  if (dashFiles.length === 0) {
    warn('dashboard/app.js: file non ancora presente (src/dashboard/public/app.js) — skip (lavori in corso)');
  } else {
    // Contratto: solo questi pattern (path, senza query).
    const allowed = [
      /^\/api\/me\/?$/,
      /^\/api\/guilds\/?$/,
      /^\/api\/guilds\/[^/]+\/?$/, // :gid
      /^\/api\/guilds\/[^/]+\/meta\/?$/,
      /^\/api\/guilds\/[^/]+\/schema\/?$/,
      /^\/api\/guilds\/[^/]+\/modules\/[^/]+\/?$/, // PUT modules/:mod
      /^\/api\/guilds\/[^/]+\/perms\/?$/, // PUT perms
      /^\/api\/guilds\/[^/]+\/audit\/?$/, // registro modifiche (sola lettura)
      /^\/api\/guilds\/[^/]+\/diag\/?$/, // diagnostica (sola lettura)
    ];
    // Spoglia commenti block + line (i commenti citano gli endpoint).
    const perFile = [];
    for (const f of dashFiles) {
      const rawSrc = fs.readFileSync(f, 'utf8');
      const code = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((ln) => ln.replace(/\/\/.*$/, ''))
        .join('\n');
      perFile.push({ file: path.relative(ROOT, f), code });
    }
    // Righe che costruiscono/chiamano endpoint (fetch, helper getJSON/putJSON, o literal /api/).
    const lines = [];
    for (const { file, code } of perFile) {
      code.split('\n')
        .map((ln) => ln.trim())
        .filter((ln) => ln && /fetch|getJSON|putJSON|\/api\//.test(ln))
        .forEach((ln) => lines.push({ file, ln }));
    }
    let checked = 0;
    for (const { file, ln } of lines) {
      // Literal su singola riga: '..."..."', '...' e `...` (i backtick con
      // ${...} vengono normalizzati a :p sotto).
      const lits = [];
      const qRe = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;
      let q;
      while ((q = qRe.exec(ln)) !== null) lits.push(q[1] !== undefined ? q[1] : (q[2] !== undefined ? q[2] : q[3]));
      const apiLits = lits.filter((s) => s.includes('/api/') || /^(\/(meta|schema|modules|perms|guilds))/.test(s));
      if (!apiLits.length) continue;
      let template;
      if (/\+/.test(ln)) {
        // Ricompone: ogni espressione tra i literal diventa un segmento :p.
        template = apiLits.join('/:p/').replace(/\/{2,}/g, '/');
        // Coda dinamica (".../guilds/" + gid): aggiunge il segmento mancante.
        if (/\+[^'"`]*$/.test(ln)) template = template.replace(/\/?$/, '/:p');
        // Se la riga usa template literal ${...} (non catturati da qRe), normalizza.
        template = template.replace(/\$\{[^}]*\}/g, ':p');
      } else {
        template = apiLits[0].replace(/\$\{[^}]*\}/g, ':p');
      }
      // Normalizza placeholder noti (:gid, <gid>, ${gid}) a :p.
      template = template.replace(/:gid|<gid>|\{gid\}/gi, ':p');
      const pathOnly = template.split('?')[0].split('#')[0];
      if (!pathOnly.startsWith('/')) continue; // URL esterni/CDN: ignorati
      checked += 1;
      const ok = allowed.some((re) => re.test(pathOnly));
      if (!ok) {
        fail(`dashboard/${file}: endpoint FUORI CONTRATTO (riga: ${ln.slice(0, 120)}) => template "${pathOnly}" — consentiti solo GET /api/me, /api/guilds, /api/guilds/:gid, /meta, /schema, PUT modules/:mod, PUT perms, GET audit`);
      }
    }
    console.log(`dashboard FE: righe endpoint scansionate: ${checked} (${dashFiles.length} file)`);
  }
} catch (e) {
  fail(`dashboard lotto: ${e.message.split('\n')[0]}`);
}

// Boot resiliente (Render): senza env la dashboard resta in ascolto in
// degrado invece di uscire -> niente "port scan timeout".
dashBootPromise = (async () => {
  const { spawn } = require('child_process');
  const port = 30000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'dashboard', 'index.js')], {
    env: { ...process.env, PORT: String(port), DISCORD_TOKEN: '', SESSION_SECRET: '', CLIENT_SECRET: '', BASE_URL: '' },
    stdio: 'ignore',
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let health = null;
    for (let i = 0; i < 20 && !health; i += 1) {
      await wait(300);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (res.ok || res.status === 200) health = await res.json().catch(() => ({}));
      } catch {}
      if (child.exitCode !== null && child.exitCode !== undefined) break;
    }
    if (child.exitCode !== null && child.exitCode !== 0) {
      fail('dashboard: esce senza env (su Render = port scan timeout)');
    } else if (!health || health.degraded !== true) {
      fail('dashboard: senza env atteso /healthz degraded:true');
    } else {
      console.log('dashboard: boot degradata ok (porta aperta, /healthz spiega le env)');
    }
  } catch (e) {
    fail(`dashboard boot (qatest): ${e.message.split('\n')[0]}`);
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }
})();

// ------------------------------------------------- (c6) COMMANDER (gate/breaker)
// Verifica: modulo OFF -> comando bloccato; timeout/errore -> breaker senza
// crash; featureOfComponent/featureOfEvent senza throw. Parte sync, parte
// async: il REPORT aspetta `commanderPromise` (con keep-alive, perché i
// timeout del Commander usano timer unref che da soli non tengono vivo il loop).
console.log('== [6/5] Commander (gate, breaker, no-crash) ==');
let commanderPromise = Promise.resolve();
let ticketPromise = Promise.resolve();
let hostPromise = Promise.resolve();
try {
  const registry = require(path.join(ROOT, 'src', 'modules', 'registry.js'));
  const commander = require(path.join(ROOT, 'src', 'modules', 'commander.js'));
  const moduleState = require(path.join(DB_DIR, 'moduleState.js'));

  // Mappa customId -> feature (componenti persistenti + bottoni dinamici).
  const compCases = [
    ['ticket_claim', 'tickets'],
    ['ticket_close_modal', 'tickets'],
    ['ticketai_publish', 'tickets'],
    ['rr_select', 'reactionRoles'],
    ['nuke_confirm:123', 'moderation'],
    ['wizard_abort', 'utility'],
    ['embed_builder', 'utility'],
    ['titolo', 'utility'],
    ['trivia:u:n:0', 'fun'],
    ['preferiresti:a:b:si', 'fun'],
    ['balance', 'economy'],
    ['sconosciuto_xyz', null],
    [null, null],
  ];
  for (const [cid, want] of compCases) {
    let got;
    try {
      got = registry.featureOfComponent(cid);
    } catch (e) {
      fail(`commander: featureOfComponent(${cid}) lancia: ${e.message.split('\n')[0]}`);
      continue;
    }
    if (got !== want) fail(`commander: featureOfComponent(${cid}) atteso ${want}, ottenuto ${got}`);
  }

  // Mappa eventi -> feature: mai throw, ritorna id o null.
  for (const ev of ['guildMemberAdd', 'messageCreate', 'voiceStateUpdate', 'evento_che_non_esiste']) {
    let got;
    try {
      got = registry.featureOfEvent(ev);
    } catch (e) {
      fail(`commander: featureOfEvent(${ev}) lancia: ${e.message.split('\n')[0]}`);
      continue;
    }
    if (got !== null && typeof got !== 'string') fail(`commander: featureOfEvent(${ev}) tipo inatteso`);
  }

  // Modulo OFF -> comando bloccato; ON -> consentito (con ripristino file).
  moduleState.setEnabled(QGUILD, 'economy', false);
  const blocked = commander.checkGate('balance', QGUILD);
  if (!blocked || blocked.ok !== false || blocked.reason !== 'disabled') {
    fail(`commander: modulo OFF dovrebbe bloccare /balance, ottenuto ${JSON.stringify(blocked)}`);
  }
  moduleState.setEnabled(QGUILD, 'economy', true);
  const allowed = commander.checkGate('balance', QGUILD);
  if (!allowed || allowed.ok !== true) fail('commander: modulo ON dovrebbe consentire /balance');
  if (moduleState.getDisabled(QGUILD).length !== 0) {
    fail('commander: moduleState sporco dopo ripristino (chiave qatest rimasta)');
  }

  // Parte async: timeout -> errore isolato; 5 errori -> breaker; guardEvent no-crash.
  const keepAlive = setInterval(() => {}, 250);
  commanderPromise = (async () => {
    try {
      const hanging = { data: { name: 'balance' }, execute: () => new Promise(() => {}) };
      const to = await commander.executeCommand(hanging, { guildId: QGUILD }, {}, { timeoutMs: 50 });
      if (!to || to.ok !== false || to.timedOut !== true) {
        fail(`commander: execute appeso dovrebbe andare in timeout, ottenuto ${JSON.stringify({ ok: to && to.ok, timedOut: to && to.timedOut })}`);
      }
      if (!to.error || to.error.code !== 'COMMANDER_TIMEOUT') {
        fail('commander: timeout senza code COMMANDER_TIMEOUT');
      }
      for (let i = 0; i < 4; i += 1) registry.recordError('economy', QGUILD, new Error(`qa boom ${i}`));
      if (!registry.isIsolated(QGUILD, 'economy')) fail('commander: dopo 5 errori economy dovrebbe essere isolata');
      const gated = commander.checkGate('balance', QGUILD);
      if (!gated || gated.ok !== false || gated.reason !== 'isolated') {
        fail(`commander: modulo isolato dovrebbe bloccare /balance, ottenuto ${JSON.stringify(gated)}`);
      }
      const boom = { name: 'messageCreate', execute: async () => { throw new Error('qa boom evento'); } };
      let gev;
      try {
        gev = await commander.guardEvent('qa-test.js', boom, [{ guildId: QGUILD }], {});
      } catch (e) {
        fail(`commander: guardEvent ha lanciato (doveva isolare): ${e.message.split('\n')[0]}`);
      }
      if (gev && gev.ok !== false) fail('commander: guardEvent su evento rotto atteso ok:false');
    } finally {
      try { registry.clearErrors(QGUILD, 'economy'); } catch {}
      try { moduleState.setEnabled(QGUILD, 'economy', true); } catch {}
      clearInterval(keepAlive);
    }
  })().catch((e) => {
    fail(`commander async (qatest): ${e.message.split('\n')[0]}`);
    try { clearInterval(keepAlive); } catch {}
  });
} catch (e) {
  fail(`commander (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c7) CERVELLO (people/profilo/learn)
console.log('== [7/5] Cervello (memoria persone, profilo server, auto-learn) ==');
try {
  const fs = require('fs');
  const os = require('os');
  const qaBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-qa-'));
  process.env.BRAIN_DIR = qaBrain;
  const people = require(path.join(ROOT, 'src', 'ai', 'brain', 'people.js'));
  const learn = require(path.join(ROOT, 'src', 'ai', 'brain', 'learn.js'));
  const profile = require(path.join(ROOT, 'src', 'ai', 'brain', 'profile.js'));
  const kernel = require(path.join(ROOT, 'src', 'ai', 'brain', 'kernel.js'));

  // people: CRUD + isolamento guild + dedup + cap input
  if (people.saveFact(QGUILD, '111', 'odio il giallo', 'Qa') !== true) fail('cervello: saveFact dovrebbe ritornare true');
  if (people.saveFact(QGUILD, '111', 'ODIO il GIALLO', 'Qa') !== false) fail('cervello: dedup case-insensitive rotto');
  if (people.getFacts(QGUILD, '111').join() !== 'odio il giallo') fail('cervello: getFacts inatteso');
  if (people.getFacts('altra_guild', '111').length !== 0) fail('cervello: fatti trapelati tra guild!');
  if (people.removeFact(QGUILD, '111', 'giallo') !== 'odio il giallo') fail('cervello: removeFact inatteso');
  try {
    people.saveFact(QGUILD, '111', 'x'.repeat(500), 'Qa');
    fail('cervello: fatto oltre cap dovrebbe lanciare');
  } catch {}
  people.saveFact(QGUILD, '111', 'tifa Napoli', 'Qa');
  if (people.forgetAll(QGUILD, '111') !== true || people.getFacts(QGUILD, '111').length !== 0) {
    fail('cervello: forgetAll non pulisce');
  }

  // learn: pattern forti sì, rumore no, mai throw
  const learnCases = [
    ['ricordati che odio il giallo', 'odio il giallo'],
    ['tifo Napoli', 'tifa Napoli'],
    ['sono allergico alle noci', 'è allergico alle noci'],
    ['che ore sono?', null],
    ['/chiedi ciao', null],
    ['ciao come va', null],
  ];
  for (const [msg, want] of learnCases) {
    const got = learn.extractFact(msg);
    if (got !== want) fail(`cervello: extractFact(${msg}) atteso ${want}, ottenuto ${got}`);
  }
  if (learn.learnFrom(QGUILD, '222', 'ricordati che amo la pizza', 'Qa') !== 'amo la pizza') {
    fail('cervello: learnFrom non salva');
  }
  if (learn.learnFrom(QGUILD, '222', 'ricordati che amo la pizza', 'Qa') !== 'dup') {
    fail('cervello: learnFrom dovrebbe segnalare dup');
  }
  people.forgetAll(QGUILD, '222');

  // profile: snapshot puro + override, mai throw
  const snap = profile.snapshotGuild({ name: 'QA', memberCount: 10, preferredLocale: 'it', channels: { cache: { filter: () => ({ map: () => ['a'] }) } } });
  if (!snap.includes('QA') || !snap.includes('10 membri')) fail(`cervello: snapshot inatteso ${snap}`);
  if (profile.snapshotGuild(null) !== '') fail('cervello: snapshot null dovrebbe essere stringa vuota');
  profile.saveOverride(QGUILD, 'Server di test QA');
  const scheda = profile.getProfile({ name: 'QA', id: QGUILD }, QGUILD);
  if (!scheda.includes('QA') || !scheda.includes('test QA')) fail('cervello: profilo senza snapshot+override');
  profile.clearOverride(QGUILD);

  // kernel retrocompatibile: senza userId/guild non aggiunge persona/profilo
  const kOld = kernel.buildContext({ guildId: QGUILD, query: 'ciao' });
  if (kOld.sources.some((s) => s.type === 'persona')) fail('cervello: kernel senza userId non deve avere persona');
  people.saveFact(QGUILD, '333', 'odio il giallo', 'Qa');
  const kNew = kernel.buildContext({ guildId: QGUILD, query: 'giallo', userId: '333', guild: { name: 'QA', id: QGUILD } });
  if (!kNew.sources.some((s) => s.type === 'persona')) fail('cervello: kernel con userId dovrebbe avere persona');
  if (!kNew.sources.some((s) => s.type === 'profilo')) fail('cervello: kernel con guild dovrebbe avere profilo');
  people.forgetAll(QGUILD, '333');

  delete process.env.BRAIN_DIR;
  fs.rmSync(qaBrain, { recursive: true, force: true });
  console.log('cervello: people/profilo/learn/kernel ok (isolamento guild verificato)');
} catch (e) {
  fail(`cervello (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c8) ORCHESTRATORE (no bypass)
// Dashboard e /modulo parlano ai moduli SOLO via Commander: vietato
// require diretto di modules/registry (domani cambia solo il trasporto).
console.log('== [8/5] Orchestratore (dashboard/modulo via Commander) ==');
try {
  const dashDir = path.join(ROOT, 'src', 'dashboard');
  const dashFiles = fs.readdirSync(dashDir).filter((f) => f.endsWith('.js'));
  for (const f of dashFiles) {
    const src = fs.readFileSync(path.join(dashDir, f), 'utf8');
    if (/(?:require|safeRequire)\(['"]\.\.\/modules\/registry['"]\)/.test(src)) {
      fail(`orchestratore: src/dashboard/${f} richiede modules/registry diretto (usare modules/commander)`);
    }
  }
  const moduloSrc = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'utility', 'modulo.js'), 'utf8');
  if (/require\(['"]\.\.\/\.\.\/modules\/registry['"]\)/.test(moduloSrc)) {
    fail('orchestratore: modulo.js richiede modules/registry diretto (usare modules/commander)');
  }
  // Handler ticket: il gate vive nel Commander (interactionCreate), mai qui.
  const ticketH = fs.readFileSync(path.join(ROOT, 'src', 'handlers', 'ticketHandler.js'), 'utf8');
  if (/require\(['"]\.\.\/modules\/registry['"]\)/.test(ticketH)) {
    fail('orchestratore: ticketHandler richiede modules/registry diretto (gate nel Commander)');
  }
  // Eventi (tranne interactionCreate, che E' il cablaggio Commander): solo commander.canRun.
  const evDir = path.join(ROOT, 'src', 'events');
  for (const f of fs.readdirSync(evDir).filter((x) => x.endsWith('.js') && x !== 'interactionCreate.js')) {
    const src = fs.readFileSync(path.join(evDir, f), 'utf8');
    if (/require\(['"]\.\.\/modules\/registry['"]\)/.test(src)) {
      fail(`orchestratore: src/events/${f} richiede modules/registry diretto (usare commander.canRun)`);
    }
  }
  // La facciata esiste e risponde (su guild QA, senza sporcare i file).
  const commander = require(path.join(ROOT, 'src', 'modules', 'commander.js'));
  for (const fn of ['listModules', 'moduleHealth', 'setModuleEnabled', 'reloadModule', 'resetModule', 'updateModuleConfig']) {
    if (typeof commander[fn] !== 'function') fail(`orchestratore: commander.${fn} mancante`);
  }
  if (!Array.isArray(commander.listModules()) || !commander.listModules().length) {
    fail('orchestratore: listModules vuota');
  }
  // canRun: stesso verdetto del registry, mai throw, fail-open su ignoto.
  const moduleState = require(path.join(DB_DIR, 'moduleState.js'));
  moduleState.setEnabled(QGUILD, 'economy', false);
  if (commander.canRun(QGUILD, 'economy').ok !== false) fail('orchestratore: canRun modulo spento');
  moduleState.setEnabled(QGUILD, 'economy', true);
  if (commander.canRun(QGUILD, 'economy').ok !== true) fail('orchestratore: canRun modulo acceso');
  if (commander.canRun(QGUILD, 'inesistente').ok !== true) fail('orchestratore: canRun fail-open');
  if (moduleState.getDisabled(QGUILD).length !== 0) fail('orchestratore: moduleState sporco');
  // Dispatch config: scrive via Commander sul modulo giusto, poi scrub.
  const before = (() => {
    try {
      const tickets = require(path.join(DB_DIR, 'tickets.js'));
      return tickets.getConfig(QGUILD);
    } catch { return null; }
  })();
  const upd = commander.updateModuleConfig(QGUILD, 'tickets', { maxPerUser: 3 });
  if (!upd || upd.maxPerUser !== 3) fail('orchestratore: dispatch tickets non applica la patch');
  try {
    commander.updateModuleConfig(QGUILD, 'modulo_che_non_esiste', {});
    fail('orchestratore: dispatch su modulo ignoto dovrebbe lanciare');
  } catch (e) {
    if (e.status !== 400) fail(`orchestratore: dispatch ignoto atteso status 400, ottenuto ${e.status}`);
  }
  scrubTestKeys();
  const { load, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const rawTickets = fs.readFileSync(dbFile('tickets'), 'utf8');
  if (rawTickets.includes(QGUILD)) fail('orchestratore: cleanup tickets incompleto dopo dispatch');
  void before;
  console.log('orchestratore: nessun bypass, facciata + dispatch ok');
} catch (e) {
  fail(`orchestratore (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c9) TICKET PRO
console.log('== [9/5] Ticket pro (priorita/oggetto/note/rating/stats) ==');
try {
  const tickets = require(path.join(DB_DIR, 'tickets.js'));
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const TQ = 'qatest_tick';
  const CH = 'qatest_tick_chan';

  // Ticket vecchio senza campi nuovi -> backfill con default.
  const f = dbFile('tickets');
  const db = load(f);
  db[TQ] = {
    config: tickets.getConfig(TQ), counter: 1,
    tickets: { [CH]: { channelId: CH, ownerId: 'u1', type: 'bug', number: 1, status: 'open', createdAt: Date.now() - 30 * 60000 } },
  };
  save(f, db);
  const backfilled = tickets.getTicket(TQ, CH);
  if (!backfilled || backfilled.priority !== 'normale' || backfilled.subject !== null
    || !Array.isArray(backfilled.notes) || backfilled.rating !== null) {
    fail('ticket: backfill campi nuovi mancato');
  }

  tickets.setPriority(TQ, CH, 'urgente');
  tickets.setSubject(TQ, CH, 'Bot offline');
  tickets.addNote(TQ, CH, 'Mod#1', 'Controllare i log');
  try {
    tickets.setPriority(TQ, CH, 'massima');
    fail('ticket: priorita invalida dovrebbe lanciare');
  } catch {}
  try {
    tickets.addNote(TQ, CH, 'Mod#1', '   ');
    fail('ticket: nota vuota dovrebbe lanciare');
  } catch {}
  if (tickets.setRating(TQ, CH, 5) !== true) fail('ticket: setRating primo voto');
  if (tickets.setRating(TQ, CH, 4) !== false) fail('ticket: setRating doppio voto dovrebbe ritornare false');
  const got = tickets.getTicket(TQ, CH);
  if (got.priority !== 'urgente' || got.subject !== 'Bot offline' || got.notes.length !== 1
    || !got.rating || got.rating.score !== 5) {
    fail('ticket: campi pro non persistiti');
  }
  const st = tickets.getStats(TQ);
  if (!st.byType || st.byType.bug !== 1) fail(`ticket: byType rotto (${JSON.stringify(st.byType)})`);
  if (st.avgRating !== 5 || st.ratingsCount !== 1) fail('ticket: stats rating inattese');

  const after = load(f);
  delete after[TQ];
  save(f, after);
  if (load(f)[TQ] !== undefined) fail('ticket: cleanup QA fallito');

  // PRO v2: domande pre-apertura, pannelli, risposte nel ticket.
  tickets.setQuestions(TQ, 'bug', ['Versione del bot?', 'Cosa stavi facendo?']);
  if (tickets.getQuestions(TQ, 'bug').length !== 2) fail('ticket: questions non salvate');
  if (tickets.getQuestions(TQ, 'supporto').length !== 0) fail('ticket: questions trapelate tra tipi');
  try {
    tickets.setQuestions(TQ, 'nope', ['x']);
    fail('ticket: tipo invalido dovrebbe lanciare');
  } catch {}
  if (tickets.setQuestions(TQ, 'bug', ['1', '2', '3', '4', '5', '6']).length !== 5) fail('ticket: cap 5 domande');
  tickets.setQuestions(TQ, 'bug', []);
  const panel = tickets.savePanel(TQ, { channelId: 'c1', messageId: 'm1', types: ['bug', 'nope'], title: 'Help' });
  if (panel.types.join() !== 'bug') fail('ticket: panel dovrebbe filtrare tipi sconosciuti');
  if (tickets.getPanels(TQ).length !== 1 || tickets.removePanel(TQ, 'c1') !== true) fail('ticket: panels CRUD');
  const commander = require(path.join(ROOT, 'src', 'modules', 'commander.js'));
  for (const cid of ['ticket_open:bug', 'ticket_open_modal:bug', 'ticket_rate_5']) {
    if (commander.featureOfComponent(cid) !== 'tickets') fail(`ticket: gate ${cid} non mappa a tickets`);
  }
  const fin = load(f);
  delete fin[TQ];
  save(f, fin);
  if (load(f)[TQ] !== undefined) fail('ticket: cleanup QA v2 fallito');

  // OPEN-TICKET style: blacklist, pin, tipo, trasferimento, staff-stats, HTML.
  if (tickets.setBlacklisted(TQ, 'u9', true) !== true || !tickets.isBlacklisted(TQ, 'u9')) {
    fail('ticket: blacklist add');
  }
  if (tickets.setBlacklisted(TQ, 'u9', true) !== false) fail('ticket: blacklist dup');
  if (tickets.setBlacklisted(TQ, 'u9', false) !== true || tickets.isBlacklisted(TQ, 'u9')) {
    fail('ticket: blacklist remove');
  }
  const db2 = load(f);
  db2[TQ] = {
    config: tickets.getConfig(TQ), counter: 2,
    tickets: {
      c1: { channelId: 'c1', ownerId: 'u1', type: 'bug', number: 1, status: 'closed', createdAt: 1, closedAt: 2, closedBy: 's1' },
      c2: { channelId: 'c2', ownerId: 'u2', type: 'supporto', number: 2, status: 'open', createdAt: 1 },
    },
  };
  save(f, db2);
  if (tickets.setPinned(TQ, 'c1', true).pinned !== true) fail('ticket: pin');
  if (tickets.setTicketType(TQ, 'c2', 'appeal').type !== 'appeal') fail('ticket: cambio tipo');
  try {
    tickets.setTicketType(TQ, 'c2', 'nope');
    fail('ticket: tipo invalido dovrebbe lanciare');
  } catch {}
  if (tickets.transferTicket(TQ, 'c2', 'u9').ownerId !== 'u9') fail('ticket: trasferimento');
  tickets.setRating(TQ, 'c1', 4);
  const staff = tickets.getStaffStats(TQ, 5);
  if (!staff.length || staff[0].userId !== 's1' || staff[0].closed !== 1 || staff[0].avgRating !== 4) {
    fail(`ticket: staff-stats inattese (${JSON.stringify(staff)})`);
  }
  const cfg = tickets.setConfig(TQ, { autoDeleteDays: 7 });
  if (cfg.autoDeleteDays !== 7) fail('ticket: autoDeleteDays non salvato');
  // HTML transcript: escape, badge bot, meta — con canale mock (async).
  ticketPromise = (async () => {
    try {
      const { buildHtmlTranscript } = require(path.join(DB_DIR, '..', 'utils', 'transcript.js'));
      const mockMsgs = [
        { id: '2', createdTimestamp: 1700000000000, content: 'ciao <b>x</b>', author: { tag: 'U#1', username: 'U', bot: false, displayAvatarURL: () => 'https://x/y.png' }, attachments: new Map(), embeds: [] },
      ];
      const mockCh = { name: 'ticket-x', id: 'c9', messages: { fetch: async () => ({ size: 1, values: () => mockMsgs, last: () => mockMsgs[0] }) } };
      const htmlAtt = await buildHtmlTranscript(mockCh, { number: 9, type: 'bug' });
      const html = htmlAtt.attachment.toString('utf8');
      if (!html.includes('&lt;b&gt;') || !html.includes('#9')) fail('ticket: HTML transcript (escape/meta)');
    } catch (e) {
      fail(`ticket html (qatest): ${e.message.split('\n')[0]}`);
    }
  })();
  const fin2 = load(f);
  delete fin2[TQ];
  save(f, fin2);
  if (load(f)[TQ] !== undefined) fail('ticket: cleanup QA v3 fallito');

  // DISCORD-TICKETS style: tag, domande x5, archivio.
  const tag = tickets.setTag(TQ, 'Orari', 'Siamo aperti 9-18');
  if (!tag || tag.name !== 'orari' || tickets.getTag(TQ, 'ORARI') !== 'Siamo aperti 9-18') {
    fail('ticket: tag set/get (case-insensitive)');
  }
  if (tickets.listTags(TQ).length !== 1) fail('ticket: tag list');
  try {
    tickets.setTag(TQ, 'x', 'y');
    fail('ticket: nome tag corto dovrebbe lanciare');
  } catch {}
  if (tickets.removeTag(TQ, 'orari') !== true || tickets.getTag(TQ, 'orari') !== null) {
    fail('ticket: tag remove');
  }
  if (tickets.setQuestions(TQ, 'bug', ['1', '2', '3', '4', '5']).length !== 5) {
    fail('ticket: cap domande dovrebbe essere 5');
  }
  tickets.setQuestions(TQ, 'bug', []);
  const fin3 = load(f);
  fin3[TQ] = {
    config: tickets.getConfig(TQ), counter: 2,
    tickets: {
      ca: { channelId: 'ca', ownerId: 'u', type: 'bug', number: 1, status: 'closed', createdAt: 1, closedAt: 100 },
      cb: { channelId: 'cb', ownerId: 'u', type: 'bug', number: 2, status: 'closed', createdAt: 1, closedAt: 200 },
      cc: { channelId: 'cc', ownerId: 'u', type: 'bug', number: 3, status: 'open', createdAt: 1 },
    },
  };
  save(f, fin3);
  const arch = tickets.recentClosed(TQ, 10).map((t) => t.number);
  if (arch.join() !== '2,1') fail(`ticket: archivio ordine/recency (${arch})`);
  const fin4 = load(f);
  delete fin4[TQ];
  save(f, fin4);
  if (load(f)[TQ] !== undefined) fail('ticket: cleanup QA v4 fallito');
  console.log('ticket: backfill/priorita/oggetto/note/rating/stats ok');
} catch (e) {
  fail(`ticket (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c10) LIVELLI PRO
console.log('== [10/5] Livelli pro (totali veri, vocali, posizione) ==');
try {
  const levels = require(path.join(DB_DIR, 'levels.js'));
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const LQ = 'qatest_lv';
  for (const fn of ['getLevel', 'addXp', 'getLeaderboard', 'getRankPosition', 'xpForLevel', 'totalXp']) {
    if (typeof levels[fn] !== 'function') fail(`livelli: levels.${fn} mancante`);
  }
  // Totale reale sulla curva: L2 = 100 + 175 + resto.
  if (levels.totalXp({ level: 2, xp: 50 }) !== 325) fail('livelli: totalXp errato');
  // Record vecchio senza voiceMinutes -> backfill 0, mai NaN.
  const r1 = levels.addXp(LQ, 'u1', 100, { messages: 0, voiceMinutes: 30 });
  if (r1.voiceMinutes !== 30 || r1.messageCount !== 0) fail('livelli: tracking vocale separato rotto');
  const r2 = levels.addXp(LQ, 'u2', 50);
  if (r2.messageCount !== 1 || r2.voiceMinutes !== 0) fail('livelli: default messaggi rotto');
  levels.addXp(LQ, 'u3', 1000);
  const lb = levels.getLeaderboard(LQ, 10);
  if (lb.map((e) => e.id).join() !== 'u3,u1,u2') fail(`livelli: ordine per totale vero rotto (${lb.map((e) => e.id)})`);
  if (levels.getRankPosition(LQ, 'u1') !== 2) fail('livelli: posizione errata');
  if (levels.getRankPosition(LQ, 'fantasma') !== null) fail('livelli: fantasma dovrebbe essere null');
  const f = dbFile('levels');
  const db = load(f);
  delete db[LQ];
  save(f, db);
  if (load(f)[LQ] !== undefined) fail('livelli: cleanup QA fallito');
  console.log('livelli: totali veri, vocali separati, posizioni ok');
} catch (e) {
  fail(`livelli (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c11) MODERAZIONE RED-STYLE
console.log('== [11/5] Moderazione (warn actions, segnala, clear filtri) ==');
try {
  const warnings = require(path.join(DB_DIR, 'warnings.js'));
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const MQ = 'qatest_md';
  for (const fn of ['getWarnings', 'addWarn', 'clearWarnings', 'removeWarn', 'getWarnActions', 'setWarnActions', 'actionFor']) {
    if (typeof warnings[fn] !== 'function') fail(`moderazione: warnings.${fn} mancante`);
  }
  const def = warnings.getWarnActions(MQ);
  if (def.length !== 1 || def[0].warns !== 3 || def[0].action !== 'timeout' || def[0].minutes !== 10) {
    fail('moderazione: default storico cambiato (3 warn -> timeout 10m)');
  }
  if (warnings.actionFor(2, def) !== null) fail('moderazione: sotto soglia non deve scattare');
  const rules = warnings.setWarnActions(MQ, [{ warns: 2, action: 'timeout', minutes: 60 }, { warns: 5, action: 'kick' }, { warns: 7, action: 'ban' }]);
  if (rules.map((r) => r.warns).join() !== '2,5,7') fail('moderazione: ordinamento regole');
  if (warnings.actionFor(6, rules).action !== 'kick') fail('moderazione: soglia più alta <= totale');
  for (const bad of [[], [{ warns: 2, action: 'timeout' }, { warns: 2, action: 'kick' }], [{ warns: 99, action: 'kick' }], [{ warns: 3, action: 'mute' }]]) {
    try {
      warnings.setWarnActions(MQ, bad);
      fail(`moderazione: regole invalide accettate (${JSON.stringify(bad)})`);
    } catch {}
  }
  // Nuovi comandi registrati nel modulo moderation (gate incluso).
  const registry = require(path.join(ROOT, 'src', 'modules', 'registry.js'));
  for (const cmd of ['warnazioni', 'segnala']) {
    if (registry.featureOfCommand(cmd) !== 'moderation') fail(`moderazione: /${cmd} non mappato a moderation`);
  }
  const f = dbFile('warnings');
  const db = load(f);
  delete db[MQ];
  save(f, db);
  if (load(f)[MQ] !== undefined) fail('moderazione: cleanup QA fallito');
  // RED Bank-style: {args} nei custom commands + banca con interessi (daily).
  const cc = require(path.join(DB_DIR, 'customCommands.js'));
  if (cc.resolveVariables('ciao {args}', { args: 'Luca' }) !== 'ciao Luca') {
    fail('custom: variabile {args} non risolta');
  }
  if (cc.resolveVariables('x{args}y', {}) !== 'xy') fail('custom: {args} assente dovrebbe essere vuoto');
  const eco = require(path.join(DB_DIR, 'economy.js'));
  eco.updateUser(MQ, 'u1', { balance: 0, bank: 10000 });
  const eu = eco.getUser(MQ, 'u1');
  const interest = Math.min(Math.floor((Number.isFinite(eu.bank) ? eu.bank : 0) * 0.02), 500);
  if (interest !== 200) fail(`moderazione/economy: interessi attesi 200, ottenuti ${interest}`);
  const { load: l2, save: s2, dbFile: d2 } = require(path.join(DB_DIR, 'jsonDb.js'));
  const ef = d2('economy');
  const edb = l2(ef);
  delete edb[MQ];
  s2(ef, edb);
  console.log('moderazione: warn actions, gate nuovi comandi ok');
} catch (e) {
  fail(`moderazione (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c12) ARCHITETTURA LUMI-STYLE
console.log('== [12/5] Contratto moduli, GDPR, retention ==');
try {
  // defineModule: contratto valido passa, id malformato no, registry intatto.
  const { defineModule } = require(path.join(ROOT, 'src', 'modules', 'defineModule.js'));
  const norm = defineModule({ id: 'test', commands: ['a', 'a'] });
  if (norm.commands.join() !== 'a' || norm.version !== '1.0.0') fail('lumi: normalizzazione contratto');
  for (const bad of [{}, { id: 'NO spazi!' }, { id: 'ok', version: 'x' }]) {
    try {
      defineModule(bad, 'qa');
      fail(`lumi: contratto accetta ${JSON.stringify(bad)}`);
    } catch {}
  }
  const registry = require(path.join(ROOT, 'src', 'modules', 'registry.js'));
  registry.reload();
  if (registry.list().length !== 15) fail(`lumi: registry dovrebbe avere 15 moduli, ha ${registry.list().length}`);
  if (!registry.list().every((m) => /^\d+\.\d+\.\d+$/.test(m.version || ''))) {
    fail('lumi: ogni modulo deve dichiarare version semver via defineModule');
  }
  if (registry.featureOfCommand('mydata') !== 'utility') fail('lumi: /mydata non mappato a utility');

  // GDPR: export legge, forget pulisce (su guild QA).
  const GQ = 'qatest_gdpr';
  const UQ = 'u_gdpr';
  const levels = require(path.join(DB_DIR, 'levels.js'));
  const eco = require(path.join(DB_DIR, 'economy.js'));
  const warnings = require(path.join(DB_DIR, 'warnings.js'));
  levels.addXp(GQ, UQ, 150);
  eco.updateUser(GQ, UQ, { balance: 10, bank: 5 });
  warnings.addWarn(GQ, UQ, { modId: 'm', reason: 'qa' });
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const mydata = require(path.join(ROOT, 'src', 'utils', 'mydata.js'));
  const snap = mydata.exportData(GQ, UQ);
  if (!snap.stores.levels || snap.stores.levels.level !== 1) fail('lumi: export livelli');
  if (!snap.stores.economy || snap.stores.economy.bank !== 5) fail('lumi: export economy');
  if (!snap.stores.warnings || snap.stores.warnings.length !== 1) fail('lumi: export warn');
  const res = mydata.forgetData(GQ, UQ);
  if (!res.removed.includes('livelli') || !res.removed.includes('economy') || !res.removed.includes('warn')) {
    fail(`lumi: forget incompleto (${res.removed})`);
  }
  const snap2 = mydata.exportData(GQ, UQ);
  if (snap2.stores.levels.level !== 0 || snap2.stores.economy.balance !== 0 || snap2.stores.warnings.length !== 0) {
    fail('lumi: dati sopravvissuti al forget');
  }
  for (const name of ['levels', 'economy', 'warnings']) {
    const f = dbFile(name);
    const db = load(f);
    if (db[GQ] !== undefined) { delete db[GQ]; save(f, db); }
    if (load(f)[GQ] !== undefined) fail(`lumi: cleanup QA fallito (${name})`);
  }

  // Retention: casi vecchi via, recenti salvi; audit vecchie via.
  const cases = require(path.join(DB_DIR, 'cases.js'));
  const cf = dbFile('cases');
  const cdb = load(cf);
  const old = Date.now() - 200 * 24 * 60 * 60 * 1000;
  cdb[GQ] = { counter: 2, items: { 1: { id: '1', type: 'warn', userId: 'u', modId: 'm', reason: 'vecchio', at: old }, 2: { id: '2', type: 'warn', userId: 'u', modId: 'm', reason: 'nuovo', at: Date.now() } } };
  save(cf, cdb);
  if (cases.pruneCases(180, Date.now()) !== 1) fail('lumi: pruneCases dovrebbe rimuovere 1');
  if (cases.getCase(GQ, '2') === null || cases.getCase(GQ, '1') !== null) fail('lumi: pruneCases ha tenuto il caso sbagliato');
  const cdb2 = load(cf);
  delete cdb2[GQ];
  save(cf, cdb2);
  console.log('lumi: contratto, GDPR, retention ok');
} catch (e) {
  fail(`lumi (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c13) SCHEMA JSON VERSIONATO
console.log('== [13/5] Migrazioni schema (stile Lumi db:migrate) ==');
try {
  const { load, save, dbFile, isMetaKey } = require(path.join(DB_DIR, 'jsonDb.js'));
  const schema = require(path.join(DB_DIR, 'schema.js'));
  if (schema.CURRENT.tickets !== 2 || schema.CURRENT.levels !== 1) fail('schema: versioni attese');
  if (!isMetaKey('__v') || isMetaKey('qatest_x')) fail('schema: isMetaKey');
  // migrateToCurrent puro su oggetto: v0 -> v2 con merge default.
  const fixture = { g1: { config: { maxPerUser: 9 }, counter: 0, tickets: {} } };
  const changed = schema.migrateToCurrent('tickets', fixture);
  if (changed !== true || fixture.__v !== 2) fail('schema: migrateToCurrent');
  if (fixture.g1.config.maxPerUser !== 9) fail('schema: migrazione deve preservare valori esistenti');
  for (const k of ['autoCloseDays', 'panels', 'questions', 'tags', 'blacklist', 'autoDeleteDays']) {
    if (fixture.g1.config[k] === undefined) fail(`schema: default mancante (${k})`);
  }
  if (schema.migrateToCurrent('tickets', fixture) !== false) fail('schema: seconda run deve essere no-op');
  if (schema.migrateToCurrent('sconosciuto', {}) !== false) fail('schema: file ignoto no-op');
  // End-to-end su file QA: fixture vecchia -> getConfig migra + timbra.
  const SQ = 'qatest_sch';
  const f = dbFile('tickets');
  const db = load(f);
  db[SQ] = { config: { maxPerUser: 3 }, counter: 0, tickets: {} };
  save(f, db);
  const tickets = require(path.join(DB_DIR, 'tickets.js'));
  const cfg = tickets.getConfig(SQ);
  if (cfg.questions === undefined || cfg.tags === undefined || load(f).__v !== 2) {
    fail('schema: migrazione end-to-end (tickets)');
  }
  const fin = load(f);
  delete fin[SQ];
  save(f, fin);
  if (load(f)[SQ] !== undefined) fail('schema: cleanup QA fallito');
  console.log('schema: versioni, merge default, idempotenza ok');
} catch (e) {
  fail(`schema (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c14) MUSICA + DIGEST
console.log('== [14/5] Musica (coda/testi/cronologia) + digest ==');
try {
  const musica = require(path.join(ROOT, 'src', 'commands', 'music', 'musica.js'));
  const subs = (musica.data.options || []).map((o) => o.name);
  for (const s of ['play', 'skip', 'coda', 'mescola', 'ripeti', 'testi', 'cronologia']) {
    if (!subs.includes(s)) fail(`musica: subcommand /${s} mancante`);
  }
  const hist = require(path.join(DB_DIR, 'musicHistory.js'));
  hist.pushTrack('qatest_mh', { title: 'A', url: 'u1' });
  hist.pushTrack('qatest_mh', { title: 'A', url: 'u1' });
  hist.pushTrack('qatest_mh', { title: 'B', url: 'u2' });
  const rec = hist.recentTracks('qatest_mh', 10).map((t) => t.title);
  if (rec.join() !== 'B,A') fail(`musica: cronologia/dedup (${rec})`);
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const f = dbFile('musicHistory');
  const db = load(f);
  delete db['qatest_mh'];
  save(f, db);
  const digest = require(path.join(ROOT, 'src', 'jobs', 'modDigest.js'));
  for (const fn of ['startModDigest', 'checkOnce', 'lastDayCases', 'lastDayWarns']) {
    if (typeof digest[fn] !== 'function') fail(`digest: modDigest.${fn} mancante`);
  }
  if (digest.lastDayCases('qatest_mh', Date.now()).length !== 0) fail('digest: guild vuota');
  console.log('musica + digest ok');
} catch (e) {
  fail(`musica (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c15) HOST OVUNQUE
console.log('== [15/5] Host universale (detect, setup, storage) ==');
try {
  const host = require(path.join(ROOT, 'src', 'host', 'index.js'));
  const cases = [
    [{ RENDER: 'true' }, 'render'],
    [{ RAILWAY_ENVIRONMENT: 'prod' }, 'railway'],
    [{ P_SERVER_UUID: 'x' }, 'pterodactyl'],
    [{ REPL_ID: 'x' }, 'replit'],
    [{ PREFIX: '/data/data/com.termux/files/usr' }, 'termux'],
    [{}, 'vps'],
  ];
  for (const [env, want] of cases) {
    if (host.detectHost(env).id !== want) fail(`host: detect ${JSON.stringify(env)} atteso ${want}`);
  }
  const rSqlite = host.recommendStorage({ id: 'vps', name: 'VPS', persistent: true }, { nodeVersion: 'v22.0.0' });
  if (rSqlite.backend !== 'sqlite') fail('host: vps+node22 dovrebbe raccomandare sqlite');
  const rJson = host.recommendStorage({ id: 'vps', name: 'VPS', persistent: true }, { nodeVersion: 'v18.0.0' });
  if (rJson.backend !== 'json') fail('host: node18 dovrebbe restare su json');
  const rEph = host.recommendStorage({ id: 'render', name: 'Render', persistent: false, needsDisk: true }, { nodeVersion: 'v22.0.0' });
  if (!rEph.warning) fail('host: disco effimero deve avvisare');
  if (!host.tokenLooksValid('MTIzNDU2Nzg5MDEyMzQ1Njc4.Abcde.XyZ1234567890abcdef')) fail('host: token valido rifiutato');
  if (host.tokenLooksValid('nope')) fail('host: token invalido accettato');
  // checkTokenLive (rete mockata) in promise dedicata: top-level sync.
  hostPromise = (async () => {
    try {
      const live401 = await host.checkTokenLive('MTIzNDU2Nzg5MDEyMzQ1Njc4.Abcde.XyZ1234567890abcdef', async () => ({ status: 401, ok: false }));
      if (live401.ok !== false) fail('host: 401 dovrebbe fallire');
      const liveOk = await host.checkTokenLive('MTIzNDU2Nzg5MDEyMzQ1Njc4.Abcde.XyZ1234567890abcdef', async () => ({ status: 200, ok: true, json: async () => ({ username: 'Bot', discriminator: '0' }) }));
      if (!liveOk.ok || liveOk.tag !== 'Bot#0') fail('host: 200 dovrebbe passare');
    } catch (e) {
      fail(`host live (qatest): ${e.message.split('\n')[0]}`);
    }
  })();
  // setup: merge .env senza perdere chiavi (in tmp).
  const setup = require(path.join(ROOT, 'scripts', 'setup.js'));
  const tmpEnv = path.join(require('os').tmpdir(), `env-qa-${Date.now()}.env`);
  fs.writeFileSync(tmpEnv, '# commento\nVECCHIA=1\nDISCORD_TOKEN=vecchio\n');
  const w = setup.writeEnvFile(tmpEnv, { DISCORD_TOKEN: 'nuovo', NUOVA: '2' });
  const back = setup.readEnvFile(tmpEnv).values;
  if (back.VECCHIA !== '1' || back.DISCORD_TOKEN !== 'nuovo' || back.NUOVA !== '2') {
    fail('host: merge .env rotto');
  }
  if (!w.backup) fail('host: backup .env.bak mancante');
  fs.rmSync(tmpEnv, { force: true });
  fs.rmSync(`${tmpEnv}.bak`, { force: true });
  if (setup.mask('segretissimo123').includes('tissimo')) fail('host: mask perde il segreto');
  console.log('host: detect, storage, token, setup ok');
} catch (e) {
  fail(`host (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c16) CONFIG DA CHAT
console.log('== [16/5] /config runtime (Termux-friendly) ==');
try {
  const settings = require(path.join(DB_DIR, 'settings.js'));
  for (const fn of ['getOverride', 'listKeys', 'setOverride', 'deleteOverride', 'effectiveEnv', 'mask']) {
    if (typeof settings[fn] !== 'function') fail(`config: settings.${fn} mancante`);
  }
  try {
    settings.setOverride('NOPE', 'x');
    fail('config: chiave ignota dovrebbe lanciare');
  } catch {}
  try {
    settings.setOverride('AI_PROVIDER', 'nope');
    fail('config: provider invalido dovrebbe lanciare');
  } catch {}
  try {
    settings.setOverride('AI_DAILY_LIMIT', 'abc');
    fail('config: limite invalido dovrebbe lanciare');
  } catch {}
  settings.setOverride('ai_provider', 'groq');
  settings.setOverride('AI_DAILY_LIMIT', '42');
  if (settings.getOverride('AI_PROVIDER') !== 'groq') fail('config: get override');
  const eff = settings.effectiveEnv({ AI_PROVIDER: 'openai', ALTRO: '1' });
  if (eff.AI_PROVIDER !== 'groq' || eff.ALTRO !== '1') fail('config: precedenza override>env');
  if (!settings.listKeys().some((k) => k.key === 'GROQ_API_KEY' && k.secret)) fail('config: secret flag');
  if (settings.mask('segretissimo123').includes('tissimo')) fail('config: mask perde segreto');
  // Lettori onorano l'override subito (niente restart).
  const ap = require(path.join(ROOT, 'src', 'ai', 'aiProviders.js'));
  if (ap.detectProvider().name !== 'groq') fail('config: detectProvider ignora override');
  if (settings.deleteOverride('AI_PROVIDER') !== true) fail('config: delete');
  if (settings.deleteOverride('AI_PROVIDER') !== false) fail('config: delete2 dovrebbe essere false');
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const f = dbFile('settings');
  const db = load(f);
  delete db.AI_DAILY_LIMIT;
  save(f, db);
  if (settings.getOverride('AI_DAILY_LIMIT') !== undefined) fail('config: cleanup fallito');
  const registry = require(path.join(ROOT, 'src', 'modules', 'registry.js'));
  if (registry.featureOfCommand('config') !== 'utility') fail('config: /config non mappato a utility');
  console.log('config: whitelist, override live, masking ok');
} catch (e) {
  fail(`config (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c17) WOW PACK
console.log('== [17/5] Wow pack (compleanni, afk, stats, youtube) ==');
try {
  const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
  const WQ = 'qatest_wow';
  const clean = (n) => {
    const f = dbFile(n);
    const db = load(f);
    if (db[WQ] !== undefined) { delete db[WQ]; save(f, db); }
  };
  const bd = require(path.join(DB_DIR, 'birthdays.js'));
  if (bd.parseDay('25/12') !== '12-25' || bd.parseDay('32/13') !== null) fail('wow: parse compleanno');
  bd.setBirthday(WQ, 'u1', '25/12');
  if (bd.birthdaysOn(WQ, new Date(2026, 11, 25)).length !== 1) fail('wow: compleanno oggi');
  if (bd.removeBirthday(WQ, 'u1') !== true) fail('wow: rimuovi compleanno');
  const afk = require(path.join(DB_DIR, 'afk.js'));
  afk.setAfk(WQ, 'u1', 'pausa');
  if (!afk.getAfk(WQ, 'u1') || afk.clearAfk(WQ, 'u1') !== true || afk.getAfk(WQ, 'u1')) fail('wow: afk set/clear');
  const yt = require(path.join(DB_DIR, 'youtube.js'));
  if (!yt.parseChannelId('UCxxxxxxxxxxxxxxxxxxxxxx') || yt.parseChannelId('nope')) fail('wow: parse youtube');
  yt.addFeed(WQ, 'UCxxxxxxxxxxxxxxxxxxxxxx', 'c1');
  if (yt.getFeeds(WQ).length !== 1) fail('wow: addFeed');
  try {
    yt.addFeed(WQ, 'nope', 'c1');
    fail('wow: feed invalido dovrebbe lanciare');
  } catch {}
  if (!yt.removeFeed(WQ, 'UCxxxxxxxxxxxxxxxxxxxxxx')) fail('wow: removeFeed');
  const sc = require(path.join(DB_DIR, 'statChannels.js'));
  sc.set(WQ, { membersId: 'm', onlineId: 'o', botsId: 'b' });
  if (sc.get(WQ).membersId !== 'm' || !sc.clear(WQ)) fail('wow: statChannels');
  const yj = require(path.join(ROOT, 'src', 'jobs', 'youtubeJob.js'));
  const salmon = '<feed><entry><yt:videoId>v1</yt:videoId><title>T</title><link rel="alternate" href="https://youtu.be/v1"/></entry></feed>';
  const parsed = yj.parseFeed(salmon);
  if (parsed.length !== 1 || parsed[0].id !== 'v1') fail('wow: parseFeed RSS');
  const registry = require(path.join(ROOT, 'src', 'modules', 'registry.js'));
  for (const [cmd, mod] of [['compleanno', 'fun'], ['afk', 'fun'], ['stats-canali', 'utility'], ['youtube', 'utility']]) {
    if (registry.featureOfCommand(cmd) !== mod) fail(`wow: /${cmd} non mappato a ${mod}`);
  }
  for (const n of ['birthdays', 'afk', 'youtube', 'statChannels']) clean(n);
  console.log('wow: compleanni, afk, stats, youtube ok');
} catch (e) {
  fail(`wow (qatest): ${e.message.split('\n')[0]}`);
}

// ------------------------------------------------- (c18) MCP PER CLAUDE
console.log('== [18/5] MCP (token + JSON-RPC + tool reali) ==');
hostPromise = hostPromise.then(() => (async () => {
  try {
    const tokens = require(path.join(DB_DIR, 'apiTokens.js'));
    for (const fn of ['createToken', 'verifyToken', 'listTokens', 'revokeToken']) {
      if (typeof tokens[fn] !== 'function') fail(`mcp: apiTokens.${fn} mancante`);
    }
    const MQ = 'qatest_mcp';
    const rec = tokens.createToken(MQ, 'owner1', 'qa');
    if (!rec.token || !rec.token.startsWith('dbt_')) fail('mcp: formato token');
    const back = tokens.verifyToken(rec.token);
    if (!back || back.guildId !== MQ) fail('mcp: verify');
    if (tokens.verifyToken('dbt_nope') !== null) fail('mcp: token falso accettato');
    if (!tokens.listTokens(MQ).some((t) => t.id === rec.id)) fail('mcp: lista');
    if (tokens.revokeToken(rec.id) !== true || tokens.verifyToken(rec.token) !== null) {
      fail('mcp: revoke');
    }

    // HTTP reale: express + mountMcp, token QA fresco.
    const rec2 = tokens.createToken(MQ, 'owner1', 'qa-http');
    const express = require('express');
    const { mountMcp } = require(path.join(ROOT, 'src', 'mcp', 'server.js'));
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    mountMcp(app);
    const port = 31000 + Math.floor(Math.random() * 1000);
    const server = await new Promise((resolve, reject) => {
      const s = app.listen(port, () => resolve(s));
      s.on('error', reject);
    });
    const call = async (body, token) => {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    };
    try {
      const noAuth = await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      if (noAuth.status !== 401) fail('mcp: senza token atteso 401');
      const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize' }, rec2.token);
      if (init.status !== 200 || !init.json.result || !init.json.result.capabilities) fail('mcp: initialize');
      const list = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, rec2.token);
      const names = (list.json.result?.tools || []).map((t) => t.name);
      for (const t of ['modules_list', 'module_status', 'module_toggle', 'guild_snapshot', 'brain_search', 'ticket_stats']) {
        if (!names.includes(t)) fail(`mcp: tool ${t} mancante`);
      }
      const mods = await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'modules_list', arguments: {} } }, rec2.token);
      if (mods.status !== 200 || !JSON.parse(mods.json.result.content[0].text).some((m) => m.id === 'tickets')) {
        fail('mcp: modules_list non risponde');
      }
      const wrongGuild = await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'module_status', arguments: { guildId: 'altra' } } }, rec2.token);
      if (wrongGuild.status !== 400) fail('mcp: guild diversa dal token dovrebbe fallire');
      const status = await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'module_status', arguments: { guildId: MQ } } }, rec2.token);
      if (status.status !== 200) fail('mcp: module_status');
      const unknown = await call({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope', arguments: {} } }, rec2.token);
      if (unknown.status !== 400) fail('mcp: tool ignoto dovrebbe fallire');
    } finally {
      await new Promise((r) => server.close(r));
    }
    tokens.revokeToken(rec2.id);
    const { load, save, dbFile } = require(path.join(DB_DIR, 'jsonDb.js'));
    const f = dbFile('apiTokens');
    const db = load(f);
    for (const [k, v] of Object.entries(db)) {
      if (v && v.guildId === MQ) delete db[k];
    }
    save(f, db);
    console.log('mcp: token, protocollo, tool, isolamento guild ok');
  } catch (e) {
    fail(`mcp (qatest): ${e.message.split('\n')[0]}`);
  }
})());

// ------------------------------------------------------------------ REPORT
function report() {
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
}

// Il REPORT aspetta i test async del Commander (c6): errori registrati dopo
// il report non verrebbero stampati ma cambierebbero solo l'exit code.
Promise.all([commanderPromise, ticketPromise, hostPromise, dashBootPromise]).then(report);
