/**
 * brain/files.js — file di riferimento caricati nel vault (regolamento,
 * FAQ, guide...). Solo testo (.txt/.md), max 100KB/file, max 1MB/guild:
 *
 *   brain/files/<guildId>/<nome>.txt
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, inside } = require('./paths');

const ALLOWED_EXT = new Set(['.txt', '.md']);
const MAX_FILE_BYTES = 100 * 1024;
const MAX_GUILD_BYTES = 1024 * 1024;
const NAME_RE = /^[a-z0-9][a-z0-9 _.-]{1,58}[a-z0-9]$/i;

function scopeDir(guildId) {
  const dir = inside('files', String(guildId));
  if (!dir) return null;
  return ensureDir(dir);
}

function validateName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(n)) throw new Error('Nome non valido: 2-60 caratteri (lettere, numeri, spazi, -, _).');
  return n;
}

function guildBytes(guildId) {
  const dir = inside('files', String(guildId));
  if (!dir || !fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      try {
        total += fs.statSync(path.join(dir, f)).size;
      } catch {}
    }
  } catch {}
  return total;
}

function listFiles(guildId) {
  const dir = inside('files', String(guildId));
  if (!dir || !fs.existsSync(dir)) return [];
  let files = [];
  try {
    files = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const st = fs.statSync(path.join(dir, f));
      if (st.isFile()) out.push({ name: f, bytes: st.size });
    } catch {}
  }
  return out;
}

/** Salva un buffer come file di riferimento. Ritorna il nome finale. */
function saveFile(guildId, name, buffer) {
  const n = validateName(name);
  const ext = path.extname(n).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error('Solo file .txt o .md.');
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8');
  if (!buf.length) throw new Error('File vuoto.');
  if (buf.length > MAX_FILE_BYTES) throw new Error('File troppo grande (max 100KB).');
  if (guildBytes(guildId) + buf.length > MAX_GUILD_BYTES) throw new Error('Spazio esaurito (max 1MB per server).');
  // Solo testo: rifiuta binari (byte nulli).
  if (buf.includes(0)) throw new Error('Solo file di testo.');
  const dir = scopeDir(guildId);
  if (!dir) throw new Error('Scope non valido.');
  const text = buf.toString('utf8').slice(0, MAX_FILE_BYTES);
  fs.writeFileSync(path.join(dir, n), text);
  return n;
}

function readStored(guildId, name, maxChars = 4000) {
  const n = String(name || '').trim();
  const dir = inside('files', String(guildId));
  if (!dir) return null;
  const full = path.join(dir, path.basename(n));
  if (path.resolve(full) !== full || !full.startsWith(path.resolve(dir))) return null;
  try {
    const content = fs.readFileSync(full, 'utf8');
    return { name: n, content: content.slice(0, maxChars), truncated: content.length > maxChars, totalChars: content.length };
  } catch {
    return null;
  }
}

function deleteStored(guildId, name) {
  const n = String(name || '').trim();
  const dir = inside('files', String(guildId));
  if (!dir) return false;
  const full = path.join(dir, path.basename(n));
  if (!full.startsWith(path.resolve(dir))) return false;
  if (!fs.existsSync(full)) return false;
  try {
    fs.unlinkSync(full);
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

/** File più pertinenti alla query (titolo + anteprima contenuto). */
function matchFiles(guildId, query, limit = 2, previewChars = 1200) {
  const q = new Set(words(query));
  if (!q.size) return [];
  const scored = [];
  for (const { name } of listFiles(guildId)) {
    const stored = readStored(guildId, name, previewChars * 2);
    if (!stored) continue;
    const hay = new Set([...words(name.replace(/[_-]/g, ' ')), ...words(stored.content.slice(0, previewChars))]);
    let score = 0;
    for (const w of q) if (wordHit(hay, w)) score += 1;
    if (score > 0) scored.push({ name, excerpt: stored.content.slice(0, previewChars), score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = {
  listFiles, saveFile, readStored, deleteStored, matchFiles, guildBytes,
  MAX_FILE_BYTES, MAX_GUILD_BYTES,
};
