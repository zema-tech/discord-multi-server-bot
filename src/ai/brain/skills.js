/**
 * brain/skills.js — skill dell'AI in stile Obsidian: file markdown con frontmatter.
 *
 *   brain/skills/global/<nome>.md      (tutte le guild)
 *   brain/skills/<guildId>/<nome>.md   (solo quella guild)
 *
 * Formato:
 *   ---
 *   name: Regolamento
 *   description: Risponde sul regolamento del server
 *   triggers: regolamento, regole, ban, warn
 *   enabled: true
 *   ---
 *   Istruzioni in markdown...
 *
 * Caps: nome 2-32 [a-z0-9-], max 30 skill/guild (+global illimitate), istruzioni max 2000 char.
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, inside } = require('./paths');

const NAME_RE = /^[a-z0-9-]{2,32}$/;
const MAX_PER_GUILD = 30;
const MAX_INSTRUCTIONS = 2000;
const MAX_DESC = 200;

const DEFAULT_SKILLS = [
  {
    name: 'accoglienza',
    description: 'Accoglie i nuovi arrivati con tono caldo',
    triggers: 'benvenuto, nuovo, appena arrivato, presentazioni',
    instructions:
      'Quando un utente è nuovo o chiede come iniziare, accoglilo con calore, ' +
      'spiega in 3 punti come muoversi nel server e invitalo a presentarsi. Tono amichevole, mai formale.',
  },
  {
    name: 'game-master',
    description: 'Anima giochi e serate sul server',
    triggers: 'gioco, serata, evento, trivia, quiz, gioco di ruolo',
    instructions:
      'Proponi giochi adatti alla chat (quiz lampo, indovinelli, sfide). ' +
      'Spiega le regole in 3 righe e fai partire il primo round. Entusiasta ma conciso.',
  },
  {
    name: 'moderatore-aiuto',
    description: 'Spiega le regole con tatto',
    triggers: 'regola, warn, ban, litigio, tossico, spam, permesso',
    instructions:
      'Spiega le regole con tatto senza accusare. Se citi provvedimenti, ricorda che solo lo staff può applicarli ' +
      'e invita a usare /ticket per i ricorsi. Mai minacciare ban.',
  },
];

function toFileName(name) {
  return `${name}.md`;
}

function parseSkill(raw) {
  const text = String(raw || '');
  const out = { name: '', description: '', triggers: [], enabled: true, instructions: '' };
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  let body = text;
  if (m) {
    body = m[2] || '';
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === 'name') out.name = v.slice(0, 32);
      else if (k === 'description') out.description = v.slice(0, MAX_DESC);
      else if (k === 'triggers') out.triggers = v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 20);
      else if (k === 'enabled') out.enabled = !/^(false|no|0|off)$/i.test(v);
    }
  }
  out.instructions = body.trim().slice(0, MAX_INSTRUCTIONS);
  return out;
}

function serializeSkill({ name, description, triggers, enabled, instructions }) {
  const trig = Array.isArray(triggers) ? triggers.join(', ') : String(triggers || '');
  return `---\nname: ${name}\ndescription: ${String(description || '').slice(0, MAX_DESC)}\ntriggers: ${trig}\nenabled: ${enabled === false ? 'false' : 'true'}\n---\n${String(instructions || '').trim().slice(0, MAX_INSTRUCTIONS)}\n`;
}

function scopeDir(guildId) {
  const dir = inside('skills', guildId === 'global' ? 'global' : String(guildId));
  if (!dir) return null;
  return ensureDir(dir);
}

function seedDefaults() {
  try {
    const dir = scopeDir('global');
    if (!dir) return;
    for (const s of DEFAULT_SKILLS) {
      const file = path.join(dir, toFileName(s.name));
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, serializeSkill({ ...s, enabled: true }));
      }
    }
  } catch {}
}

function readSkillFile(file) {
  try {
    const skill = parseSkill(fs.readFileSync(file, 'utf8'));
    if (!skill.name) skill.name = path.basename(file, '.md');
    return skill;
  } catch {
    return null;
  }
}

/** Tutte le skill (global + guild). Ritorna [{...skill, scope}]. */
function listSkills(guildId) {
  seedDefaults();
  const out = [];
  const seen = new Set();
  for (const scope of ['global', String(guildId || '')].filter(Boolean)) {
    const dir = inside('skills', scope);
    if (!dir || !fs.existsSync(dir)) continue;
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    } catch {
      continue;
    }
    for (const f of files) {
      const skill = readSkillFile(path.join(dir, f));
      if (!skill || seen.has(skill.name)) continue;
      seen.add(skill.name);
      out.push({ ...skill, scope });
    }
  }
  return out;
}

function validateName(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!NAME_RE.test(n)) throw new Error('Nome skill non valido: 2-32 caratteri (a-z, 0-9, -).');
  return n;
}

function countGuildSkills(guildId) {
  const dir = inside('skills', String(guildId));
  if (!dir || !fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function saveSkill(guildId, { name, description, triggers, instructions, enabled }) {
  const n = validateName(name);
  const dir = scopeDir(guildId);
  if (!dir) throw new Error('Scope non valido.');
  const file = path.join(dir, toFileName(n));
  if (!fs.existsSync(file) && countGuildSkills(guildId) >= MAX_PER_GUILD) {
    throw new Error(`Max ${MAX_PER_GUILD} skill per server.`);
  }
  const trig = Array.isArray(triggers)
    ? triggers
    : String(triggers || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  fs.writeFileSync(file, serializeSkill({ name: n, description, triggers: trig.slice(0, 20), instructions, enabled }));
  return n;
}

function setEnabled(guildId, name, enabled) {
  const n = validateName(name);
  const dir = inside('skills', String(guildId));
  const globalDir = inside('skills', 'global');
  const file = dir ? path.join(dir, toFileName(n)) : null;
  const target = file && fs.existsSync(file) ? file : globalDir ? path.join(globalDir, toFileName(n)) : null;
  if (!target || !fs.existsSync(target)) throw new Error('Skill non trovata.');
  const skill = readSkillFile(target);
  if (!skill) throw new Error('Skill illeggibile.');
  fs.writeFileSync(target, serializeSkill({ ...skill, enabled }));
  return n;
}

function removeSkill(guildId, name) {
  const n = validateName(name);
  const dir = inside('skills', String(guildId));
  if (!dir) return false;
  const file = path.join(dir, toFileName(n));
  if (!fs.existsSync(file)) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

function words(text) {
  return String(text || '').toLowerCase().split(/[^a-zà-ÿ0-9]+/i).filter((w) => w.length > 2);
}

/** Match esatto oppure per prefisso (min 4 char: "sera" trova "serale"). */
function wordHit(hay, w) {
  if (hay.has(w)) return true;
  if (w.length < 4) return false;
  for (const h of hay) {
    if (h.length >= 4 && (h.startsWith(w) || w.startsWith(h))) return true;
  }
  return false;
}

/** Skill abilitate ordinate per pertinenza alla query (match trigger). Max `limit`. */
function matchSkills(guildId, query, limit = 2) {
  const q = new Set(words(query));
  if (!q.size) return [];
  const scored = [];
  for (const s of listSkills(guildId)) {
    if (!s.enabled) continue;
    const hay = new Set([...words(s.triggers.join(' ')), ...words(s.description), ...words(s.name.replace(/-/g, ' '))]);
    let score = 0;
    for (const w of q) if (wordHit(hay, w)) score += 1;
    // bonus se un trigger multi-parola compare per intero
    const ql = String(query || '').toLowerCase();
    for (const t of s.triggers) if (t.length > 3 && ql.includes(t)) score += 2;
    if (score > 0) scored.push({ skill: s, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((e) => e.skill);
}

module.exports = {
  listSkills, saveSkill, setEnabled, removeSkill, matchSkills,
  parseSkill, serializeSkill, validateName, DEFAULT_SKILLS, MAX_PER_GUILD,
};
