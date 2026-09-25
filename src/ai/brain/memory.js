/**
 * brain/memory.js — memorie del bot in stile Obsidian: note markdown con
 * [[wikilink]] e #tag, una cartella per guild. Ogni nota:
 *
 *   brain/memory/<guildId>/<titolo>.md
 *
 *   ---
 *   title: Regole serate gioco
 *   tags: eventi, venerdì
 *   created: 2026-09-18T...
 *   updated: ...
 *   ---
 *   Il venerdì sera si gioca a [[trivia]]...
 *
 * Caps: titolo 2-60 char [parole, numeri, spazi, -], max 200 note/guild, 2000 char/nota.
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, inside } = require('./paths');

const MAX_NOTES = 200;
const MAX_NOTE_CHARS = 2000;
const TITLE_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 _-]{1,59}$/;

function scopeDir(guildId) {
  const dir = inside('memory', String(guildId));
  if (!dir) return null;
  return ensureDir(dir);
}

function fileName(title) {
  return `${title}.md`;
}

function validateTitle(title) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  if (!TITLE_RE.test(t)) throw new Error('Titolo non valido: 2-60 caratteri (lettere, numeri, spazi, -, _).');
  if (t.toLowerCase() === 'readme') throw new Error('Titolo riservato.');
  return t;
}

function extractLinks(text) {
  const out = [];
  const re = /\[\[([^\[\]]{1,60})\]\]/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 30);
}

function extractTags(text) {
  const out = [];
  const re = /(^|\s)#([a-zà-ÿ0-9_-]{2,30})/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const t = m[2].toLowerCase();
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

function parseNote(raw) {
  const text = String(raw || '');
  const note = { title: '', tags: [], created: null, updated: null, body: '' };
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  let body = text;
  if (m) {
    body = m[2] || '';
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === 'title') note.title = v.slice(0, 60);
      else if (k === 'tags') note.tags = v.split(',').map((s) => s.trim().replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, 20);
      else if (k === 'created') note.created = v || null;
      else if (k === 'updated') note.updated = v || null;
    }
  }
  note.body = body.trim().slice(0, MAX_NOTE_CHARS);
  if (!note.tags.length) note.tags = extractTags(note.body);
  return note;
}

function serializeNote({ title, tags, created, updated, body }) {
  const now = new Date().toISOString();
  return `---\ntitle: ${title}\ntags: ${(tags || []).join(', ')}\ncreated: ${created || now}\nupdated: ${updated || now}\n---\n${String(body || '').trim().slice(0, MAX_NOTE_CHARS)}\n`;
}

function readNoteFile(file, fallbackTitle) {
  try {
    const note = parseNote(fs.readFileSync(file, 'utf8'));
    if (!note.title) note.title = fallbackTitle;
    note.links = extractLinks(note.body);
    return note;
  } catch {
    return null;
  }
}

function listNotes(guildId) {
  const dir = inside('memory', String(guildId));
  if (!dir || !fs.existsSync(dir)) return [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const note = readNoteFile(path.join(dir, f), path.basename(f, '.md'));
    if (note) out.push(note);
  }
  return out;
}

function saveNote(guildId, title, body, tags = []) {
  const t = validateTitle(title);
  const dir = scopeDir(guildId);
  if (!dir) throw new Error('Scope non valido.');
  const file = path.join(dir, fileName(t));
  const existed = fs.existsSync(file);
  if (!existed) {
    try {
      if (fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length >= MAX_NOTES) {
        throw new Error(`Max ${MAX_NOTES} note per server.`);
      }
    } catch (e) {
      if (e.message.startsWith('Max')) throw e;
    }
  }
  const prev = existed ? readNoteFile(file, t) : null;
  const cleanTags = Array.isArray(tags) ? tags : String(tags || '').split(',').map((s) => s.trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
  const note = {
    title: t,
    tags: (cleanTags.length ? cleanTags : extractTags(body)).slice(0, 20),
    created: (prev && prev.created) || new Date().toISOString(),
    updated: new Date().toISOString(),
    body: String(body || '').trim().slice(0, MAX_NOTE_CHARS),
  };
  if (!note.body) throw new Error('Nota vuota.');
  fs.writeFileSync(file, serializeNote(note));
  return t;
}

function getNote(guildId, title) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  const dir = inside('memory', String(guildId));
  if (!dir) return null;
  const note = readNoteFile(path.join(dir, fileName(t)), t);
  if (!note) return null;
  // backlinks: note che linkano questa
  const all = listNotes(guildId);
  note.backlinks = all.filter((n) => n.title.toLowerCase() !== note.title.toLowerCase() && n.links.some((l) => l.toLowerCase() === note.title.toLowerCase())).map((n) => n.title);
  return note;
}

function deleteNote(guildId, title) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  const dir = inside('memory', String(guildId));
  if (!dir) return false;
  const file = path.join(dir, fileName(t));
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

function wordHit(hay, w) {
  if (hay.has(w)) return true;
  if (w.length < 4) return false;
  for (const h of hay) {
    if (h.length >= 4 && (h.startsWith(w) || w.startsWith(h))) return true;
  }
  return false;
}

/** Ricerca per parole/tag/titolo. Ritorna [{note, score}] max `limit`. */
function searchNotes(guildId, query, limit = 3) {
  const qwords = new Set(words(query));
  const ql = String(query || '').toLowerCase().trim();
  if (!qwords.size && !ql) return [];
  const scored = [];
  for (const note of listNotes(guildId)) {
    let score = 0;
    if (ql && note.title.toLowerCase().includes(ql)) score += 5;
    const hay = new Set([...words(note.title), ...words(note.body), ...note.tags]);
    for (const w of qwords) if (wordHit(hay, w)) score += 1;
    for (const tag of note.tags) if (ql.includes(tag) && tag.length > 2) score += 2;
    if (score > 0) scored.push({ note, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = {
  listNotes, saveNote, getNote, deleteNote, searchNotes,
  parseNote, serializeNote, extractLinks, extractTags, validateTitle,
  MAX_NOTES, MAX_NOTE_CHARS,
};
