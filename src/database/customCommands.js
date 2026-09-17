const { load, save, dbFile } = require('./jsonDb');

const FILE = dbFile('customCommands');

// Custom commands stile PeakBot: trigger `!nome` -> risposta con variabili.
// Storage per guild: { [nome]: { response, createdBy, at, uses } }
// `uses` è un contatore extra (non richiesto dallo storage minimo) usato per la variabile {count}.
const MAX_COMMANDS = 20;
const MAX_RESPONSE = 1500;
const NAME_RE = /^[a-z0-9-]{2,20}$/;

// NOTA sui nomi riservati: il DB non può conoscere tutti gli slash command
// registrati (dipendono da deploy-commands.js e dagli altri agenti), quindi qui
// si blocca una lista fissa di nomi che colliderebbero con i comandi core.
// Aggiornare questa lista se nuovi comandi core usano nomi testuali simili.
const RESERVED = ['help', 'ping', 'ticket', 'ban', 'kick'];

function readAll() {
  const db = load(FILE);
  return typeof db === 'object' && db !== null ? db : {};
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

// Valida il nome di un custom command. Ritorna { ok, value } oppure { ok: false, error }.
function validateName(name) {
  const value = normalizeName(name);
  if (!NAME_RE.test(value)) {
    return { ok: false, error: 'Nome non valido: usa 2-20 caratteri minuscoli tra a-z, 0-9 e "-".' };
  }
  if (RESERVED.includes(value)) {
    return { ok: false, error: `Il nome "${value}" è riservato (comando del bot).` };
  }
  return { ok: true, value };
}

function validateResponse(response) {
  if (typeof response !== 'string' || !response.trim()) {
    return { ok: false, error: 'La risposta non può essere vuota.' };
  }
  if (response.length > MAX_RESPONSE) {
    return { ok: false, error: `Risposta troppo lunga (max ${MAX_RESPONSE} caratteri).` };
  }
  return { ok: true, value: response };
}

function getGuildMap(db, guildId) {
  const map = db[guildId];
  return map && typeof map === 'object' ? map : {};
}

// Lista i custom command di una guild: [{ name, response, createdBy, at, uses }], ordinati per nome.
function list(guildId) {
  const map = getGuildMap(readAll(), guildId);
  return Object.keys(map)
    .sort()
    .map((name) => ({ name, ...map[name] }));
}

// Singolo command o null (il nome viene normalizzato: trim + lowercase).
function get(guildId, name) {
  const map = getGuildMap(readAll(), guildId);
  const entry = map[normalizeName(name)];
  return entry && typeof entry === 'object' ? { ...entry } : null;
}

function exists(guildId, name) {
  return get(guildId, name) !== null;
}

function create(guildId, name, response, createdBy) {
  const nv = validateName(name);
  if (!nv.ok) return nv;
  const rv = validateResponse(response);
  if (!rv.ok) return rv;

  const db = readAll();
  const map = getGuildMap(db, guildId);
  if (map[nv.value] !== undefined) {
    return { ok: false, error: `Esiste già un comando "!${nv.value}".` };
  }
  if (Object.keys(map).length >= MAX_COMMANDS) {
    return { ok: false, error: `Limite raggiunto (max ${MAX_COMMANDS} comandi per server).` };
  }

  const entry = {
    response: rv.value,
    createdBy: createdBy ? String(createdBy) : null,
    at: new Date().toISOString(),
    uses: 0,
  };
  db[guildId] = { ...map, [nv.value]: entry };
  save(FILE, db);
  return { ok: true, name: nv.value, command: { name: nv.value, ...entry } };
}

function update(guildId, name, response) {
  const nv = validateName(name);
  if (!nv.ok) return nv;
  const rv = validateResponse(response);
  if (!rv.ok) return rv;

  const db = readAll();
  const map = getGuildMap(db, guildId);
  if (map[nv.value] === undefined) {
    return { ok: false, error: `Nessun comando "!${nv.value}" da modificare.` };
  }

  const entry = { ...map[nv.value], response: rv.value };
  db[guildId] = { ...map, [nv.value]: entry };
  save(FILE, db);
  return { ok: true, name: nv.value, command: { name: nv.value, ...entry } };
}

function deleteCommand(guildId, name) {
  const value = normalizeName(name);
  const db = readAll();
  const map = getGuildMap(db, guildId);
  if (map[value] === undefined) return false;
  const next = { ...map };
  delete next[value];
  db[guildId] = next;
  save(FILE, db);
  return true;
}

// Incrementa il contatore usi di un comando. Ritorna il nuovo conteggio (0 se il comando non esiste).
function incrementUses(guildId, name) {
  const value = normalizeName(name);
  const db = readAll();
  const map = getGuildMap(db, guildId);
  if (map[value] === undefined) return 0;
  const uses = (Number(map[value].uses) || 0) + 1;
  db[guildId] = { ...map, [value]: { ...map[value], uses } };
  save(FILE, db);
  return uses;
}

// Sostituzione variabili PURA (nessun accesso a Discord/DB): usata sia dal
// listener `!nome` sia dall'anteprima di /comando. Contesto tutto-stringhe/numeri.
// Variabili: {user} {username} {server} {count} {channel} {date}
function resolveVariables(template, context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const replacements = {
    '{user}': ctx.userMention != null ? String(ctx.userMention) : '',
    '{username}': ctx.username != null ? String(ctx.username) : '',
    '{server}': ctx.serverName != null ? String(ctx.serverName) : '',
    '{count}': ctx.count != null ? String(ctx.count) : '0',
    '{channel}': ctx.channelRef != null ? String(ctx.channelRef) : '',
    '{date}': ctx.dateStr != null ? String(ctx.dateStr) : '',
  };
  let out = String(template == null ? '' : template);
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }
  return out;
}

module.exports = {
  list,
  get,
  create,
  update,
  delete: deleteCommand,
  remove: deleteCommand,
  exists,
  validateName,
  incrementUses,
  resolveVariables,
  MAX_COMMANDS,
  MAX_RESPONSE,
  NAME_RE,
  RESERVED,
};
