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
    const ap = require(path.join(ROOT, 'src', 'utils', 'aiProviders.js'));
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
  const dashApp = path.join(ROOT, 'src', 'dashboard', 'public', 'app.js');
  if (!fs.existsSync(dashApp)) {
    warn('dashboard/app.js: file non ancora presente (src/dashboard/public/app.js) — skip (lavori in corso)');
  } else {
    const rawSrc = fs.readFileSync(dashApp, 'utf8');
    // Contratto: solo questi pattern (path, senza query).
    const allowed = [
      /^\/api\/me\/?$/,
      /^\/api\/guilds\/?$/,
      /^\/api\/guilds\/[^/]+\/?$/, // :gid
      /^\/api\/guilds\/[^/]+\/meta\/?$/,
      /^\/api\/guilds\/[^/]+\/schema\/?$/,
      /^\/api\/guilds\/[^/]+\/modules\/[^/]+\/?$/, // PUT modules/:mod
      /^\/api\/guilds\/[^/]+\/perms\/?$/, // PUT perms
    ];
    // Spoglia commenti block + line (i commenti di app.js citano gli endpoint).
    const code = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((ln) => ln.replace(/\/\/.*$/, ''))
      .join('\n');
    // Righe che costruiscono/chiamano endpoint (fetch, helper getJSON/putJSON, o literal /api/).
    const lines = code.split('\n')
      .map((ln) => ln.trim())
      .filter((ln) => ln && /fetch|getJSON|putJSON|\/api\//.test(ln));
    let checked = 0;
    for (const ln of lines) {
      // Literal su singola riga (niente backtick multilinea: solo ' e ").
      const lits = [];
      const qRe = /"([^"\n]*)"|'([^'\n]*)'/g;
      let q;
      while ((q = qRe.exec(ln)) !== null) lits.push(q[1] !== undefined ? q[1] : q[2]);
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
        fail(`dashboard/app.js: endpoint FUORI CONTRATTO (riga: ${ln.slice(0, 120)}) => template "${pathOnly}" — consentiti solo GET /api/me, /api/guilds, /api/guilds/:gid, /meta, /schema, PUT modules/:mod, PUT perms`);
      }
    }
    console.log(`dashboard/app.js: righe endpoint scansionate: ${checked}`);
  }
} catch (e) {
  fail(`dashboard lotto: ${e.message.split('\n')[0]}`);
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
