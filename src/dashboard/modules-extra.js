'use strict';
/**
 * src/dashboard/modules-extra.js — Moduli dashboard extra ("settare TUTTO dal web").
 *
 * Collega SOLO chiavi reali lette dai moduli src/database/* (API get/set +
 * DEFAULTS + validazioni) e dai comandi src/commands/** (setup/config).
 * CommonJS, Node 24, zero dipendenze. Mai chiamate rete: `guild` serve solo
 * per validare esistenza ID via guild.channels.cache / guild.roles.cache.
 *
 * CONTRATTO (usato da un altro agente in api.js):
 *   EXTRA_SCHEMA: [{ module, title, icon, section, description, fields, custom? }]
 *   readExtra(gid) -> { [mod]: valori } (mai lancia, default sensati)
 *   writeExtra(gid, mod, patch, guild) -> updated; lancia {status:400,message}
 *     su input invalido; ritorna null se mod non gestito.
 *
 * MODULI MAPPATI (5):
 *   1. ticketsPlus    <- database/tickets.js (DEFAULT_CONFIG reale:
 *                        panelChannelId, categoryId, supportRoleIds;
 *                        maxPerUser 1..20 e autoCloseDays 0..365 restano nel
 *                        modulo base "tickets"). Fonte comando: /ticket setup
 *                        (canale-panel, categoria, ruolo-supporto x2).
 *                        supportRoleIds: max 10, solo ruoli esistenti non-managed.
 *   2. aiPlus          <- database/aiConfig.js (DEFAULTS reali + sanitizeKnown:
 *                        mentionChannels, MAX_MENTION_CHANNELS=50 nel codice ma
 *                        cap dashboard a 5 per non spammare; mentionReply/
 *                        automodAI/ticketAI/funAI/systemPrompt restano nel
 *                        modulo base "ai"). Fonte comando: /ai-config.
 *                        Tipo schema 'text' (ID separati da virgola) perché il
 *                        contratto non prevede un tipo lista-canali; in write
 *                        si accettano array OPPURE stringa "id1, id2".
 *   3. reactionRoles   <- database/reactionRoles.js (getPanel/setPanel/
 *                        addOption/removeOption reali; defaultPanel reale:
 *                        channelId/title/description).
 *                        Limiti dal comando /reactionroles crea: titolo max 100,
 *                        descrizione max 1000 (cap dashboard allineato al
 *                        comando, il DB non tronca). messageId resta gestito
 *                        da /reactionroles pubblica: in read si espongono
 *                        messageId + optionsCount informativi, in write si
 *                        rifiuta. Opzioni via action add-option/remove-option/
 *                        clear-options (clear = loop sul removeOption esistente,
 *                        solo cache guild, mai fetch).
 *   4. lockdown        <- database/lockdown.js (getLockdown: snapshot { motivo,
 *                        by, byTag, at, channels }). SOLA LETTURA: la dashboard
 *                        mostra attivo/non attivo + motivo/autore/data/conteggio
 *                        canali; ogni write lancia 400 e rimanda a /lockdown
 *                        on|off (attivare un lockdown dal web è pericoloso:
 *                        tocca gli overwrite di TUTTI i canali testuali).
 *   5. shop            <- database/shop.js (getItem/setItem/removeItem/
 *                        listItems reali; mappa persistente { [roleId]: price }).
 *                        Fonte comando: /shop aggiungi|rimuovi (staff con
 *                        Gestisci ruoli) + validazione vendibilità
 *                        (non @everyone, non managed). Modulo "lista" come
 *                        autoresponder/commands/rewards nel PUT base: body
 *                        action-based { action:'set', roleId, price } oppure
 *                        { action:'remove', roleId }; in read si espone
 *                        itemCount + listsExtra.shop (max 50, ordinati per
 *                        prezzo come listItems). Prezzo: intero >= 1 come
 *                        validPrice del DB; cap dashboard a 10.000.000
 *                        anti-abuso (il comando Discord non ha tetto).
 *                        Ruolo validato solo su guild.roles.cache esistente +
 *                        non-managed + non-@everyone (la gerarchia
 *                        role.editable resta enforced dai comandi all'acquisto).
 *
 * MODULI OMESSI (con motivo):
 *   - economy (tuning dailyAmount/workMin/workMax): database/economy.js NON
 *     espone alcuna config di tuning — solo saldi per-utente
 *     (getUser/updateUser/addBalance/getLeaderboard). DAILY_AMOUNT=500,
 *     jobs/min/max e COOLDOWN sono costanti hardcoded in
 *     commands/economy/daily.js e work.js. Niente chiavi reali -> omesso.
 *   - levelsPlus (xpPerMessage/xpCooldown): database/levels.js NON espone
 *     tuning — solo getLevel/addXp/getLeaderboard/xpForLevel con formula
 *     hardcoded (100 + level*75). Niente chiavi reali -> omesso.
 *   - suggest (config dedicata): NON esiste un modulo database/suggest.js —
 *     solo suggest.json { counters } (contatori, non config) e
 *     suggestChannelId in guildConfig, già coperto dal modulo base "general".
 *     Niente altro da mappare -> omesso.
 *   - invites (canale log/bonus): database/invites.js NON espone config
 *     persistente — solo cache/stats/invitedBy/leaderboard (dati runtime).
 *     Il comando /inviti è sola lettura (info/classifica). Niente chiavi
 *     scrivibili reali -> omesso.
 *   - lotteria (ticketPrice/threshold): database/lotteria.js PERSISTE
 *     ticketPrice/threshold per guild ma NON esporta alcun setter e NESSUN
 *     comando li configura (solo info/compra/estrai). Aggiungerli dal web
 *     inventerebbe una nuova API di tuning -> omesso.
 *   - stanze (rooms per-utente): database/stanze.js contiene stanze runtime
 *     possedute dagli utenti (ownerId/type), non impostazioni admin.
 *     Niente config di guild scrivibile -> omesso.
 */

const SNOWFLAKE_RE = /^\d{10,25}$/;
const MAX_TEXT = 1000;

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch {
    return null;
  }
}

function fail(message) {
  throw { status: 400, message: String(message) };
}

function failUnavailable(modulo) {
  throw { status: 501, message: `Modulo ${modulo} non disponibile.` };
}

function isSnowflake(v) {
  return typeof v === 'string' && SNOWFLAKE_RE.test(v);
}

function channelInGuild(guild, id) {
  try {
    return Boolean(
      guild && guild.channels && guild.channels.cache && guild.channels.cache.get(id)
    );
  } catch {
    return false;
  }
}

function roleInGuild(guild, id) {
  try {
    const r = guild && guild.roles && guild.roles.cache
      ? guild.roles.cache.get(id)
      : null;
    return r || null;
  } catch {
    return null;
  }
}

/** Valida un campo canale (stile api.js: snowflake + esistenza in cache, mai fetch). */
function checkChannelField(guild, key, v) {
  if (v === null) return null;
  if (!isSnowflake(v)) fail(`Canale non valido per ${key}: atteso ID Discord.`);
  if (!channelInGuild(guild, v)) {
    fail(`Canale non trovato in questo server per ${key}: ricarica la pagina.`);
  }
  return v;
}

/** Valida una lista ruoli (stile api.js: snowflake + esistenti + non-managed). */
function checkRolesField(guild, key, v, max) {
  if (!Array.isArray(v)) fail(`${key} deve essere una lista di ID ruolo.`);
  if (v.length > max) fail(`${key}: massimo ${max} ruoli.`);
  const seen = [];
  for (const id of v) {
    if (!isSnowflake(id)) fail(`ID ruolo non valido in ${key}.`);
    const role = roleInGuild(guild, id);
    if (!role) fail(`Un ruolo di ${key} non esiste più: ricarica la pagina.`);
    if (role.managed) fail(`I ruoli dei bot non possono essere usati in ${key}.`);
    if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}

/** Testo con cap (stile api.js: tronca invece di rifiutare gli overlong). */
function checkText(key, v, max, allowEmpty) {
  if (typeof v !== 'string') fail(`${key} deve essere testo.`);
  const s = v.slice(0, max == null ? MAX_TEXT : max);
  if (!allowEmpty && !s.trim()) fail(`${key} non può essere vuoto.`);
  return s;
}

function asIdOrNull(v) {
  return typeof v === 'string' && v ? v : null;
}

function strOrNull(v, max) {
  if (typeof v !== 'string' || !v) return null;
  return v.slice(0, max);
}

// ---------------------------------------------------------------------------
// EXTRA_SCHEMA
// ---------------------------------------------------------------------------
const EXTRA_SCHEMA = [
  {
    module: 'ticketsPlus',
    title: 'Ticket avanzati',
    icon: '🎫',
    section: 'Ticket & Vocali',
    description: 'Pannello ticket, categoria di creazione e ruoli staff. ' +
      'Log, max per utente e auto-chiusura restano nel modulo base Ticket.',
    fields: [
      {
        key: 'panelChannelId',
        label: 'Canale pannello ticket',
        type: 'channel',
        help: 'Dove viene pubblicato il pannello con i pulsanti di apertura.',
      },
      {
        key: 'categoryId',
        label: 'Categoria nuovi ticket',
        type: 'channel',
        help: 'Categoria dove il bot crea i canali ticket.',
      },
      {
        key: 'supportRoleIds',
        label: 'Ruoli staff ticket',
        type: 'roles',
        help: 'Max 10 ruoli (esclusi quelli dei bot). Possono vedere e gestire i ticket.',
      },
    ],
  },
  {
    module: 'aiPlus',
    title: 'AI menzioni',
    icon: '🤖',
    section: 'AI & Extra',
    description: 'In quali canali il bot risponde quando viene menzionato. ' +
      'Interruttori AI e prompt restano nel modulo base AI.',
    fields: [
      {
        key: 'mentionChannels',
        label: 'Canali risposta alle menzioni',
        type: 'text',
        placeholder: '123456789012345678, 234567890123456789',
        help: 'ID dei canali (max 5) separati da virgola; lista vuota = nessun canale. ' +
          'Funziona solo con "Risposta alle menzioni" attiva nel modulo AI.',
      },
    ],
  },
  {
    module: 'reactionRoles',
    title: 'Reaction roles',
    icon: '🎭',
    section: 'Moderazione',
    description: 'Pannello self-service per i ruoli. Le voci del menu e la ' +
      'pubblicazione si gestiscono con /reactionroles nel server.',
    fields: [
      {
        key: 'channelId',
        label: 'Canale del pannello',
        type: 'channel',
        help: 'Canale testuale dove pubblicare il pannello.',
      },
      {
        key: 'title',
        label: 'Titolo del pannello',
        type: 'text',
        placeholder: 'Scegli i tuoi ruoli',
        help: 'Max 100 caratteri.',
      },
      {
        key: 'description',
        label: 'Descrizione del pannello',
        type: 'text',
        multiline: true,
        placeholder: 'Seleziona un ruolo dal menu qui sotto…',
        help: 'Max 1000 caratteri.',
      },
    ],
  },
  {
    module: 'lockdown',
    title: 'Lockdown (sola lettura)',
    icon: '🔒',
    section: 'Moderazione',
    description: 'Stato del lockdown di emergenza in sola lettura. Per attivarlo ' +
      'o disattivarlo usa /lockdown on|off nel server: blocca la scrittura in ' +
      'tutti i canali testuali ed è troppo delicato per il web.',
    fields: [],
    custom: 'lockdown',
  },
  {
    module: 'shop',
    title: 'Negozio ruoli',
    icon: '🛒',
    section: 'Economia',
    description: 'Ruoli in vendita con le monete del server. Si gestisce solo ' +
      'da questa dashboard (il comando /shop nel server rimanda qui).',
    fields: [],
    custom: 'shop',
  },
];

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
function readTicketsPlus(gid) {
  const fallback = { panelChannelId: null, categoryId: null, supportRoleIds: [] };
  try {
    const tickets = safeRequire('../database/tickets');
    if (!tickets || typeof tickets.getConfig !== 'function') return { ...fallback };
    const cfg = tickets.getConfig(gid) || {};
    return {
      panelChannelId: asIdOrNull(cfg.panelChannelId),
      categoryId: asIdOrNull(cfg.categoryId),
      supportRoleIds: Array.isArray(cfg.supportRoleIds)
        ? cfg.supportRoleIds.filter((r) => typeof r === 'string' && r)
        : [],
    };
  } catch {
    return { ...fallback, supportRoleIds: [] };
  }
}

function readAiPlus(gid) {
  const fallback = { mentionChannels: [] };
  try {
    const aiConfig = safeRequire('../database/aiConfig');
    if (!aiConfig || typeof aiConfig.getConfig !== 'function') return { ...fallback };
    const cfg = aiConfig.getConfig(gid) || {};
    return {
      mentionChannels: Array.isArray(cfg.mentionChannels)
        ? cfg.mentionChannels.filter((c) => typeof c === 'string' && c)
        : [],
    };
  } catch {
    return { ...fallback, mentionChannels: [] };
  }
}

function readReactionRoles(gid) {
  const fallback = {
    channelId: null, title: 'Scegli i tuoi ruoli', description: '', messageId: null, optionsCount: 0,
  };
  try {
    const rr = safeRequire('../database/reactionRoles');
    if (!rr || typeof rr.getPanel !== 'function') return { ...fallback };
    const p = rr.getPanel(gid) || {};
    return {
      channelId: asIdOrNull(p.channelId),
      title: typeof p.title === 'string' && p.title ? p.title.slice(0, 100) : fallback.title,
      description: typeof p.description === 'string' ? p.description.slice(0, 1000) : '',
      messageId: asIdOrNull(p.messageId),
      optionsCount: Array.isArray(p.options) ? p.options.length : 0,
    };
  } catch {
    return { ...fallback };
  }
}

function readRROptions(gid) {
  try {
    const rr = safeRequire('../database/reactionRoles');
    if (!rr || typeof rr.getPanel !== 'function') return [];
    const p = rr.getPanel(gid) || {};
    if (!Array.isArray(p.options)) return [];
    return p.options
      .filter((o) => o && typeof o.roleId === 'string')
      .map((o) => ({
        roleId: o.roleId,
        label: typeof o.label === 'string' ? o.label.slice(0, 100) : o.roleId,
        emoji: typeof o.emoji === 'string' ? o.emoji.slice(0, 50) : null,
      }))
      .slice(0, 25);
  } catch {
    return [];
  }
}
function readLockdown(gid) {
  const inactive = { active: false, motivo: null, byTag: null, at: null, channelCount: 0 };
  try {
    const ld = safeRequire('../database/lockdown');
    if (!ld || typeof ld.getLockdown !== 'function') return { ...inactive };
    const snap = ld.getLockdown(gid);
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return { ...inactive };
    const channels = snap.channels && typeof snap.channels === 'object' && !Array.isArray(snap.channels)
      ? snap.channels
      : {};
    return {
      active: true,
      motivo: strOrNull(snap.motivo, 500),
      byTag: strOrNull(snap.byTag, 100),
      at: typeof snap.at === 'string' ? snap.at.slice(0, 100) : null,
      channelCount: Object.keys(channels).length,
    };
  } catch {
    return { ...inactive };
  }
}

function readShopList(gid) {
  try {
    const shop = safeRequire('../database/shop');
    if (!shop || typeof shop.listItems !== 'function') return [];
    const items = shop.listItems(gid);
    return Array.isArray(items) ? items.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function readShop(gid) {
  try {
    return { itemCount: readShopList(gid).length };
  } catch {
    return { itemCount: 0 };
  }
}

/**
 * Legge i moduli extra. Mai lancia, mai crea record se il modulo DB manca
 * (safeRequire -> default in memoria).
 */
function readExtra(gid) {
  return {
    ticketsPlus: readTicketsPlus(gid),
    aiPlus: readAiPlus(gid),
    reactionRoles: readReactionRoles(gid),
    lockdown: readLockdown(gid),
    shop: readShop(gid),
    // Pattern anticipato dal GET guild in api.js: listsExtra finisce in `lists`.
    listsExtra: { shop: readShopList(gid), rrOptions: readRROptions(gid) },
  };
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------
function writeTicketsPlus(gid, patch, guild) {
  if (!gid) fail('guildId mancante.');
  const tickets = safeRequire('../database/tickets');
  if (!tickets || typeof tickets.setConfig !== 'function') failUnavailable('tickets');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Body non valido.');
  const keys = Object.keys(patch);
  if (keys.length === 0) fail('Body vuoto: niente da salvare.');
  const allowed = ['panelChannelId', 'categoryId', 'supportRoleIds'];
  for (const k of keys) {
    if (!allowed.includes(k)) fail(`Chiave non valida per ticketsPlus: ${k}.`);
  }
  const clean = {};
  if (patch.panelChannelId !== undefined) {
    clean.panelChannelId = checkChannelField(guild, 'panelChannelId', patch.panelChannelId);
  }
  if (patch.categoryId !== undefined) {
    clean.categoryId = checkChannelField(guild, 'categoryId', patch.categoryId);
  }
  if (patch.supportRoleIds !== undefined) {
    clean.supportRoleIds = checkRolesField(guild, 'supportRoleIds', patch.supportRoleIds, 10);
  }
  return tickets.setConfig(gid, clean);
}

function writeAiPlus(gid, patch, guild) {
  if (!gid) fail('guildId mancante.');
  const aiConfig = safeRequire('../database/aiConfig');
  const setter = aiConfig && typeof aiConfig.setConfig === 'function'
    ? aiConfig.setConfig
    : aiConfig && typeof aiConfig.updateConfig === 'function'
      ? aiConfig.updateConfig
      : null;
  if (!setter) failUnavailable('AI');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Body non valido.');
  const keys = Object.keys(patch);
  if (keys.length === 0) fail('Body vuoto: niente da salvare.');
  for (const k of keys) {
    if (k !== 'mentionChannels') fail(`Chiave non valida per aiPlus: ${k}.`);
  }
  let list = patch.mentionChannels;
  if (typeof list === 'string') {
    list = list.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(list)) fail('mentionChannels deve essere una lista di ID canale o testo separato da virgole.');
  if (list.length > 5) fail('mentionChannels: massimo 5 canali.');
  const seen = [];
  for (const id of list) {
    if (!isSnowflake(id)) fail('ID canale non valido in mentionChannels.');
    if (!channelInGuild(guild, id)) {
      fail('Un canale di mentionChannels non esiste in questo server: ricarica la pagina.');
    }
    if (!seen.includes(id)) seen.push(id);
  }
  return setter(gid, { mentionChannels: seen });
}

function writeReactionRoles(gid, patch, guild) {
  if (!gid) fail('guildId mancante.');
  const rr = safeRequire('../database/reactionRoles');
  if (!rr || typeof rr.setPanel !== 'function') failUnavailable('reactionRoles');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Body non valido.');
  if (patch.action === 'add-option' || patch.action === 'remove-option') {
    return writeRROption(gid, patch, guild, rr);
  }
  if (patch.action === 'clear-options') {
    return writeRRClear(gid, rr);
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) fail('Body vuoto: niente da salvare.');
  const allowed = ['channelId', 'title', 'description'];
  for (const k of keys) {
    if (!allowed.includes(k)) fail(`Chiave non valida per reactionRoles: ${k}.`);
  }
  const clean = {};
  if (patch.channelId !== undefined) {
    clean.channelId = checkChannelField(guild, 'channelId', patch.channelId);
  }
  if (patch.title !== undefined) {
    const t = checkText('title', patch.title, 100, false).trim().slice(0, 100);
    if (!t) fail('title non può essere vuoto.');
    clean.title = t;
  }
  if (patch.description !== undefined) {
    const d = checkText('description', patch.description, 1000, false).trim().slice(0, 1000);
    if (!d) fail('description non può essere vuota.');
    clean.description = d;
  }
  return rr.setPanel(gid, clean);
}

const SHOP_MAX_PRICE = 10000000; // cap dashboard anti-abuso (il DB accetta interi >= 1)

/** Azioni opzioni reaction roles: {action:'add-option'|'remove-option', roleId, label?, emoji?}. */
function writeRROption(gid, patch, guild, rr) {
  const [valid] = checkRolesField(guild, 'roleId', [patch.roleId], 1);
  const roleId = valid;
  if (roleId === gid) fail('Il ruolo @everyone non può essere un reaction role.');
  if (patch.action === 'remove-option') {
    if (typeof rr.removeOption !== 'function') failUnavailable('reactionRoles');
    const removed = rr.removeOption(gid, roleId);
    if (!removed || removed.removed !== true) fail('Opzione non trovata.');
    return { removed: true, roleId };
  }
  if (typeof rr.addOption !== 'function') failUnavailable('reactionRoles');
  const label = typeof patch.label === 'string' && patch.label.trim()
    ? patch.label.trim().slice(0, 100) : roleId;
  const emoji = typeof patch.emoji === 'string' && patch.emoji.trim()
    ? patch.emoji.trim().slice(0, 50) : null;
  const r = rr.addOption(gid, { roleId, label, emoji });
  if (!r || (!r.added && !r.updated)) {
    if (r && r.full) fail('Limite opzioni raggiunto.');
    if (r && r.invalid) fail('Ruolo non valido.');
    fail('Salvataggio opzione fallito.');
  }
  return { added: !!r.added, updated: !!r.updated, roleId };
}

/** Svuota tutte le opzioni via loop sul removeOption esistente. Idempotente. */
function writeRRClear(gid, rr) {
  if (!gid) fail('guildId mancante.');
  if (!rr || typeof rr.getPanel !== 'function' || typeof rr.removeOption !== 'function') {
    failUnavailable('reactionRoles');
  }
  const panel = rr.getPanel(gid) || {};
  const ids = Array.isArray(panel.options)
    ? [...new Set(
      panel.options
        .filter((o) => o && typeof o.roleId === 'string' && o.roleId)
        .map((o) => o.roleId)
    )]
    : [];
  let cleared = 0;
  for (const roleId of ids) {
    const r = rr.removeOption(gid, roleId);
    if (r && r.removed === true) cleared += 1;
  }
  return { cleared };
}

/** Prezzo shop: intero 1..SHOP_MAX_PRICE (stile api.js: range con 400). */
function checkShopPrice(v) {
  const n = Math.floor(Number(v));
  if (!Number.isInteger(n) || n < 1 || n > SHOP_MAX_PRICE) {
    fail(`Prezzo non valido: intero tra 1 e ${SHOP_MAX_PRICE}.`);
  }
  return n;
}

/**
 * Negozio ruoli (action-based come rewards nel PUT base).
 * Body: { action:'set', roleId, price } | { action:'remove', roleId }.
 * Ritorna il risultato del modulo DB ({ roleId, price } | { removed, roleId }).
 */
function writeShop(gid, patch, guild) {
  if (!gid) fail('guildId mancante.');
  const shop = safeRequire('../database/shop');
  if (!shop || typeof shop.setItem !== 'function' || typeof shop.removeItem !== 'function') {
    failUnavailable('shop');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Body non valido.');
  const action = patch.action;
  if (action !== 'set' && action !== 'remove') fail('Action non valida (set/remove).');
  const roleId = patch.roleId;
  if (!isSnowflake(roleId)) fail('Ruolo non valido: atteso ID Discord.');
  if (action === 'remove') {
    const removed = shop.removeItem(gid, roleId);
    return { removed: Boolean(removed), roleId };
  }
  const role = roleInGuild(guild, roleId);
  if (!role) fail('Ruolo non trovato in questo server: ricarica la pagina.');
  if (role.managed) fail('I ruoli dei bot non possono essere venduti.');
  if (guild && guild.id && roleId === guild.id) fail('Il ruolo @everyone non può essere venduto.');
  const price = checkShopPrice(patch.price);
  return shop.setItem(gid, roleId, price);
}

/**
 * Applica una patch a un modulo extra. Ritorna l'oggetto updated dal modulo DB,
 * null se `mod` non è gestito qui, lancia { status, message } su input invalido.
 * `lockdown` è sola lettura: ogni write lancia 400 con rimando a /lockdown.
 */
function writeExtra(gid, mod, patch, guild) {
  if (mod === 'ticketsPlus') return writeTicketsPlus(gid, patch, guild);
  if (mod === 'aiPlus') return writeAiPlus(gid, patch, guild);
  if (mod === 'reactionRoles') return writeReactionRoles(gid, patch, guild);
  if (mod === 'shop') return writeShop(gid, patch, guild);
  if (mod === 'lockdown') {
    fail('Lockdown in sola lettura dalla dashboard: usa /lockdown on|off nel server per attivarlo o disattivarlo.');
  }
  return null;
}

module.exports = { EXTRA_SCHEMA, readExtra, writeExtra };
