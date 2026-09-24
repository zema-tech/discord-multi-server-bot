/**
 * brain/people.js — memoria delle persone, per server (stile Obsidian).
 *
 *   brain/people/<guildId>/<userId>.md
 *
 *   ---
 *   user: NomeVisualizzato
 *   updated: 2026-09-24T...
 *   ---
 *   - Odia il giallo
 *   - Tifa Napoli
 *
 * Isolamento rigido per guild: i fatti di un server non escono mai da lì.
 * Privacy: chiunque può vedere i PROPRI fatti e dimenticarli; lo staff può
 * gestire quelli altrui. Caps: max 30 fatti/persona, 200 char/fatto.
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, inside } = require('./paths');

const MAX_FACTS = 30;
const MAX_FACT_CHARS = 200;

function scopeDir(guildId) {
  const dir = inside('people', String(guildId || ''));
  if (!dir) return null;
  return ensureDir(dir);
}

function fileOf(guildId, userId) {
  const dir = inside('people', String(guildId || ''));
  if (!dir || !/^\d+$/.test(String(userId || ''))) return null;
  return path.join(dir, `${userId}.md`);
}

function cleanFact(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) throw new Error('Fatto vuoto.');
  if (t.length > MAX_FACT_CHARS) throw new Error(`Fatto troppo lungo (max ${MAX_FACT_CHARS} caratteri).`);
  return t;
}

function parseFile(raw, userId) {
  const text = String(raw || '');
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  const out = { userId: String(userId), name: '', updated: null, facts: [] };
  let body = text;
  if (m) {
    body = m[2] || '';
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === 'user') out.name = v.slice(0, 64);
      else if (k === 'updated') out.updated = v || null;
    }
  }
  for (const line of body.split('\n')) {
    const t = line.replace(/^\s*[-*•]\s*/, '').trim();
    if (t) out.facts.push(t.slice(0, MAX_FACT_CHARS));
  }
  return out;
}

/** Fatti di un utente in questo server. [] se nessuno. Mai lancia. */
function getFacts(guildId, userId) {
  try {
    const file = fileOf(guildId, userId);
    if (!file || !fs.existsSync(file)) return [];
    return parseFile(fs.readFileSync(file, 'utf8'), userId).facts;
  } catch {
    return [];
  }
}

/** Nome visualizzato salvato. '' se sconosciuto. Mai lancia. */
function getName(guildId, userId) {
  try {
    const file = fileOf(guildId, userId);
    if (!file || !fs.existsSync(file)) return '';
    return parseFile(fs.readFileSync(file, 'utf8'), userId).name || '';
  } catch {
    return '';
  }
}

/**
 * Aggiunge un fatto (deduplicato, case-insensitive). Ritorna true se nuovo,
 * false se già presente. Lancia su input non valido o cap raggiunto.
 */
function saveFact(guildId, userId, fact, displayName = '') {
  const t = cleanFact(fact);
  const dir = scopeDir(guildId);
  const file = fileOf(guildId, userId);
  if (!dir || !file) throw new Error('Scope non valido.');
  const current = getFacts(guildId, userId);
  if (current.some((f) => f.toLowerCase() === t.toLowerCase())) return false;
  if (current.length >= MAX_FACTS) throw new Error(`Max ${MAX_FACTS} fatti per persona: dimenticane uno prima.`);
  const prev = fs.existsSync(file) ? parseFile(fs.readFileSync(file, 'utf8'), userId) : null;
  const name = String(displayName || '').trim().slice(0, 64) || (prev && prev.name) || '';
  const now = new Date().toISOString();
  const body = [...current, t].map((f) => `- ${f}`).join('\n');
  fs.writeFileSync(file, `---\nuser: ${name}\nupdated: ${now}\n---\n${body}\n`);
  return true;
}

/** Rimuove un fatto per indice (1-based) o testo parziale. Ritorna il fatto rimosso o null. */
function removeFact(guildId, userId, ref) {
  try {
    const file = fileOf(guildId, userId);
    if (!file || !fs.existsSync(file)) return null;
    const parsed = parseFile(fs.readFileSync(file, 'utf8'), userId);
    const facts = parsed.facts;
    if (!facts.length) return null;
    let idx = -1;
    const n = Number.parseInt(String(ref), 10);
    if (Number.isFinite(n) && n >= 1 && n <= facts.length) idx = n - 1;
    else {
      const q = String(ref || '').toLowerCase().trim();
      if (!q) return null;
      idx = facts.findIndex((f) => f.toLowerCase().includes(q));
    }
    if (idx < 0) return null;
    const [removed] = facts.splice(idx, 1);
    if (!facts.length) {
      fs.unlinkSync(file);
    } else {
      const body = facts.map((f) => `- ${f}`).join('\n');
      fs.writeFileSync(file, `---\nuser: ${parsed.name}\nupdated: ${new Date().toISOString()}\n---\n${body}\n`);
    }
    return removed;
  } catch {
    return null;
  }
}

/** Dimentica tutto di un utente in questo server. Ritorna true se esisteva qualcosa. */
function forgetAll(guildId, userId) {
  try {
    const file = fileOf(guildId, userId);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/** Quante persone con fatti in questo server. Mai lancia. */
function countPeople(guildId) {
  try {
    const dir = inside('people', String(guildId || ''));
    if (!dir || !fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

module.exports = {
  getFacts, getName, saveFact, removeFact, forgetAll, countPeople,
  MAX_FACTS, MAX_FACT_CHARS,
};
