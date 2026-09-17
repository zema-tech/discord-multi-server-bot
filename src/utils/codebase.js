/**
 * codebase.js — l'AI conosce il proprio codice.
 * Indice file, lettura sicura (solo src/scripts, niente .env/git/node_modules),
 * ricerca keyword con snippet. Usato da /codice e dal self-improvement notturno.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED_DIRS = ['src', 'scripts'];
const ALLOWED_TOP_FILES = ['deploy-commands.js', 'package.json'];
const MAX_READ_CHARS = 8000;
const MAX_SNIPPETS = 10;

function isAllowed(rel) {
  const norm = String(rel || '').replace(/\\/g, '/');
  if (!norm || norm.startsWith('/') || norm.includes('..')) return false;
  if (norm.includes('node_modules') || norm.startsWith('.git')) return false;
  if (path.basename(norm).startsWith('.env')) return false;
  const [first] = norm.split('/');
  if (ALLOWED_DIRS.includes(first)) return true;
  if (ALLOWED_TOP_FILES.includes(norm)) return true;
  return false;
}

function walkJs(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walkJs(full, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      try {
        out.push({ rel: path.relative(ROOT, full).replace(/\\/g, '/'), size: fs.statSync(full).size });
      } catch {}
    }
  }
  return out;
}

/** Albero file JS + conteggi per il prompt AI. */
function buildTree() {
  const files = walkJs(path.join(ROOT, 'src'));
  for (const top of ALLOWED_TOP_FILES) {
    const full = path.join(ROOT, top);
    try {
      if (fs.existsSync(full)) files.push({ rel: top, size: fs.statSync(full).size });
    } catch {}
  }
  const commands = files.filter((f) => f.rel.startsWith('src/commands/')).length;
  const events = files.filter((f) => f.rel.startsWith('src/events/')).length;
  return { files, total: files.length, commands, events };
}

/** Legge un file del repo (sicuro). Ritorna { rel, content, truncated }. */
function readFile(rel, maxChars = MAX_READ_CHARS) {
  if (!isAllowed(rel)) throw new Error('Percorso non consentito.');
  const full = path.join(ROOT, String(rel).replace(/\\/g, '/'));
  const resolved = path.resolve(full);
  if (!resolved.startsWith(ROOT + path.sep)) throw new Error('Percorso non consentito.');
  let content = '';
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch {
    throw new Error('File non trovato.');
  }
  const truncated = content.length > maxChars;
  return { rel, content: truncated ? content.slice(0, maxChars) : content, truncated, totalChars: content.length };
}

/** Cerca un termine nei .js consentiti. Ritorna [{ file, line, snippet }]. */
function searchCode(term, limit = MAX_SNIPPETS) {
  const q = String(term || '').trim();
  if (!q) return [];
  const out = [];
  const files = walkJs(path.join(ROOT, 'src'));
  for (const f of files) {
    let lines = [];
    try {
      lines = fs.readFileSync(path.join(ROOT, f.rel), 'utf8').split('\n');
    } catch {
      continue;
    }
    lines.forEach((text, i) => {
      if (out.length >= limit) return;
      if (text.toLowerCase().includes(q.toLowerCase())) {
        out.push({ file: f.rel, line: i + 1, snippet: text.trim().slice(0, 160) });
      }
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Riepilogo compatto per il system prompt dell'AI. */
function codeSummary() {
  const tree = buildTree();
  const byDir = {};
  for (const f of tree.files) {
    const dir = f.rel.includes('/') ? f.rel.slice(0, f.rel.lastIndexOf('/')) : '.';
    byDir[dir] = (byDir[dir] || 0) + 1;
  }
  const lines = Object.entries(byDir).sort().map(([d, n]) => `- ${d}/ (${n} file)`);
  return `Bot Discord discord-multi-server-bot (Node.js, discord.js v14, CommonJS).\n${tree.total} file JS: ${tree.commands} comandi, ${tree.events} eventi.\nStruttura:\n${lines.join('\n')}`;
}

module.exports = { buildTree, readFile, searchCode, codeSummary, isAllowed, ROOT, MAX_READ_CHARS };
