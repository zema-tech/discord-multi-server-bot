const { ChannelType } = require('discord.js');

// Limiti anti-abuso / anti-ratelimit (PeakBot-style): pochi oggetti per volta.
const MAX_CATEGORIES = 5;
const MAX_CHANNELS_TOTAL = 12;
const MAX_ROLES = 5;
const MAX_NAME_LEN = 100;
const PAUSE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 3 blueprint hardcoded (IT). Formato interno:
 * { label, description, categories: [{ name, channels: [{ name, type }] }], roles: [{ name, color }] }
 * type: 'text' | 'voice' (normalizzato in validateBlueprint).
 */
const TEMPLATES = {
  gaming: {
    label: '🎮 Gaming',
    description: 'Server per community di giocatori: info, zone gaming e vocali per le partite.',
    categories: [
      {
        name: '📢 INFO',
        channels: [
          { name: 'benvenuto', type: 'text' },
          { name: 'regole', type: 'text' },
          { name: 'annunci', type: 'text' },
        ],
      },
      {
        name: '🎮 GAMING',
        channels: [
          { name: 'chat-generale', type: 'text' },
          { name: 'cerca-squadra', type: 'text' },
          { name: 'clip-e-momenti', type: 'text' },
          { name: 'Sala 1', type: 'voice' },
          { name: 'Sala 2', type: 'voice' },
        ],
      },
      {
        name: '🔊 VOCALI',
        channels: [
          { name: 'Chill', type: 'voice' },
          { name: 'Torneo', type: 'voice' },
        ],
      },
    ],
    roles: [
      { name: 'Staff', color: '#ed4245' },
      { name: 'Moderatore', color: '#57f287' },
      { name: 'Giocatore', color: '#5865f2' },
      { name: 'VIP', color: '#fee75c' },
      { name: 'Ospite', color: '#95a5a6' },
    ],
  },
  community: {
    label: '💬 Community',
    description: 'Server per community generale: accoglienza, chiacchiere e ritrovo vocale.',
    categories: [
      {
        name: '📢 INFO',
        channels: [
          { name: 'benvenuto', type: 'text' },
          { name: 'regole', type: 'text' },
          { name: 'annunci', type: 'text' },
        ],
      },
      {
        name: '💬 COMMUNITY',
        channels: [
          { name: 'chat-generale', type: 'text' },
          { name: 'presentazioni', type: 'text' },
          { name: 'suggerimenti', type: 'text' },
          { name: 'media', type: 'text' },
        ],
      },
      {
        name: '🔊 RITROVO',
        channels: [
          { name: 'Chiacchiere', type: 'voice' },
          { name: 'Musica', type: 'voice' },
        ],
      },
    ],
    roles: [
      { name: 'Staff', color: '#ed4245' },
      { name: 'Moderatore', color: '#57f287' },
      { name: 'Membro', color: '#5865f2' },
      { name: 'Amico', color: '#fee75c' },
    ],
  },
  studio: {
    label: '💼 Studio',
    description: 'Server per team / studio creativo: ufficio, progetti e sale riunione.',
    categories: [
      {
        name: '📢 UFFICIO',
        channels: [
          { name: 'annunci', type: 'text' },
          { name: 'regole', type: 'text' },
          { name: 'bacheca', type: 'text' },
        ],
      },
      {
        name: '💼 PROGETTI',
        channels: [
          { name: 'idee', type: 'text' },
          { name: 'in-corso', type: 'text' },
          { name: 'revisioni', type: 'text' },
        ],
      },
      {
        name: '🎙 SALE',
        channels: [
          { name: 'Riunione', type: 'voice' },
          { name: 'Focus', type: 'voice' },
        ],
      },
    ],
    roles: [
      { name: 'Founder', color: '#ed4245' },
      { name: 'Manager', color: '#faa81a' },
      { name: 'Collaboratore', color: '#5865f2' },
      { name: 'Cliente', color: '#57f287' },
      { name: 'Ospite', color: '#95a5a6' },
    ],
  },
};

function cleanName(value) {
  return String(value ?? '').trim().slice(0, MAX_NAME_LEN);
}

// Accetta 'text'/'voice', 'GuildText'/'GuildVoice', ChannelType numerici (0/2) o stringhe numeriche.
function normalizeType(value) {
  if (value === ChannelType.GuildText || value === ChannelType.GuildVoice) return value;
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'voice' || s === 'guildvoice' || s === '2' || s === 'vocale' || s === 'vocali') return ChannelType.GuildVoice;
  if (s === 'text' || s === 'guildtext' || s === '0' || s === 'testo' || s === 'testuale' || s === 'testuali') return ChannelType.GuildText;
  return null;
}

// Accetta '#rrggbb', 'rrggbb' o interi discord.js; null = colore default.
function normalizeColor(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
  const s = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return 'invalid';
}

/**
 * Clamp + sanitizza un blueprint.
 * Formato atteso: { categories: [{ name, channels: [{ name, type }] }], roles: [{ name, color }] }
 * @returns {{ ok: boolean, errors: string[], warnings: string[], blueprint: object|null }}
 * - errors: problemi fatali (ok=false, NON applicare).
 * - warnings: ritocchi automatici (nomi troncati, tipi corretti, eccedenze tagliate).
 */
function validateBlueprint(bp) {
  const errors = [];
  const warnings = [];
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) {
    return { ok: false, errors: ['Blueprint non valido: deve essere un oggetto.'], warnings, blueprint: null };
  }

  const rawCats = Array.isArray(bp.categories) ? bp.categories : [];
  const rawRoles = Array.isArray(bp.roles) ? bp.roles : [];
  if (rawCats.length === 0 && rawRoles.length === 0) {
    return { ok: false, errors: ['Blueprint vuoto: servono categorie con canali e/o ruoli.'], warnings, blueprint: null };
  }

  const categories = [];
  let channelCount = 0;
  for (const rawCat of rawCats.slice(0, MAX_CATEGORIES)) {
    if (channelCount >= MAX_CHANNELS_TOTAL) break; // resto coperto dal warning "Limite canali"
    if (!rawCat || typeof rawCat !== 'object') {
      warnings.push('Categoria non valida saltata.');
      continue;
    }
    const name = cleanName(rawCat.name);
    if (!name) {
      warnings.push('Categoria con nome vuoto saltata.');
      continue;
    }
    if (String(rawCat.name).trim().length > MAX_NAME_LEN) warnings.push(`Nome categoria troncato a ${MAX_NAME_LEN} caratteri: "${name}".`);
    const channels = [];
    const rawChannels = Array.isArray(rawCat.channels) ? rawCat.channels : [];
    for (const rawCh of rawChannels) {
      if (channelCount >= MAX_CHANNELS_TOTAL) break;
      if (!rawCh || typeof rawCh !== 'object') {
        warnings.push(`Canale non valido saltato (categoria "${name}").`);
        continue;
      }
      const chName = cleanName(rawCh.name);
      if (!chName) {
        warnings.push(`Canale con nome vuoto saltato (categoria "${name}").`);
        continue;
      }
      if (String(rawCh.name).trim().length > MAX_NAME_LEN) warnings.push(`Nome canale troncato: "${chName}".`);
      let type = normalizeType(rawCh.type);
      if (type === null) {
        warnings.push(`Tipo non valido per "${chName}", usato testuale.`);
        type = ChannelType.GuildText;
      }
      channels.push({ name: chName, type });
      channelCount += 1;
    }
    if (channels.length === 0) {
      warnings.push(`Categoria "${name}" senza canali validi, saltata.`);
      continue;
    }
    categories.push({ name, channels });
  }
  if (rawCats.length > MAX_CATEGORIES) warnings.push(`Solo le prime ${MAX_CATEGORIES} categorie sono state tenute.`);

  // Conta canali totali richiesti per avvisare sul taglio oltre il limite.
  let requestedChannels = 0;
  for (const c of rawCats) {
    if (c && Array.isArray(c.channels)) requestedChannels += c.channels.length;
  }
  if (requestedChannels > MAX_CHANNELS_TOTAL) {
    warnings.push(`Limite canali: tenuti i primi ${MAX_CHANNELS_TOTAL} su ${requestedChannels} richiesti.`);
  }

  const roles = [];
  for (const rawRole of rawRoles.slice(0, MAX_ROLES)) {
    if (!rawRole || typeof rawRole !== 'object') {
      warnings.push('Ruolo non valido saltato.');
      continue;
    }
    const name = cleanName(rawRole.name);
    if (!name) {
      warnings.push('Ruolo con nome vuoto saltato.');
      continue;
    }
    if (String(rawRole.name).trim().length > MAX_NAME_LEN) warnings.push(`Nome ruolo troncato: "${name}".`);
    const color = normalizeColor(rawRole.color);
    if (color === 'invalid') {
      warnings.push(`Colore non valido per il ruolo "${name}", usato default.`);
      roles.push({ name, color: null });
    } else {
      roles.push({ name, color });
    }
  }
  if (rawRoles.length > MAX_ROLES) warnings.push(`Limite ruoli: tenuti i primi ${MAX_ROLES} su ${rawRoles.length} richiesti.`);

  if (categories.length === 0 && roles.length === 0) {
    return { ok: false, errors: errors.length ? errors : ['Nessun contenuto valido nel blueprint.'], warnings, blueprint: null };
  }

  return { ok: errors.length === 0, errors, warnings, blueprint: { categories, roles } };
}

/**
 * Applica un blueprint al server: prima i ruoli, poi categorie/canali in SEQUENZA
 * con pausa anti-ratelimit. Non cancella mai nulla di esistente.
 * @returns {Promise<{ roles: Array, channels: Array, failed: Array }>}
 */
async function applyBlueprint(guild, bp, reason = 'Applicazione blueprint') {
  const v = validateBlueprint(bp);
  if (!v.ok || !v.blueprint) {
    throw new Error(`Blueprint non valido: ${v.errors[0] || 'contenuto mancante.'}`);
  }
  const clean = v.blueprint;
  const report = { roles: [], channels: [], failed: [] };

  for (const role of clean.roles) {
    try {
      const created = await guild.roles.create({ name: role.name, color: role.color ?? undefined, reason });
      report.roles.push({ id: created.id, name: created.name });
    } catch (e) {
      report.failed.push({ cosa: `ruolo "${role.name}"`, errore: e.message || String(e) });
    }
    await sleep(PAUSE_MS);
  }

  for (const cat of clean.categories) {
    let parent = null;
    try {
      parent = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, reason });
      report.channels.push({ id: parent.id, name: parent.name, type: 'categoria' });
    } catch (e) {
      report.failed.push({ cosa: `categoria "${cat.name}"`, errore: e.message || String(e) });
    }
    await sleep(PAUSE_MS);

    for (const ch of cat.channels) {
      try {
        const created = await guild.channels.create({
          name: ch.name,
          type: ch.type,
          parent: parent ? parent.id : undefined,
          reason,
        });
        report.channels.push({
          id: created.id,
          name: created.name,
          type: ch.type === ChannelType.GuildVoice ? 'vocale' : 'testuale',
        });
      } catch (e) {
        report.failed.push({ cosa: `canale "${ch.name}"`, errore: e.message || String(e) });
      }
      await sleep(PAUSE_MS);
    }
  }

  return report;
}

/** Testo anteprima struttura (riuso in template/costruisci). */
function describeBlueprint(clean) {
  const lines = [];
  for (const r of clean.roles) lines.push(`🎭 ${r.name}`);
  for (const c of clean.categories) {
    lines.push(`📁 **${c.name}**`);
    for (const ch of c.channels) {
      const icon = ch.type === ChannelType.GuildVoice || ch.type === 'voice' ? '🔊' : '💬';
      lines.push(`　${icon} ${ch.name}`);
    }
  }
  return lines.join('\n').slice(0, 4000);
}

module.exports = {
  TEMPLATES,
  validateBlueprint,
  applyBlueprint,
  describeBlueprint,
  LIMITS: { MAX_CATEGORIES, MAX_CHANNELS_TOTAL, MAX_ROLES, MAX_NAME_LEN, PAUSE_MS },
};
