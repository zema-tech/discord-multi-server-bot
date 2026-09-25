/**
 * ai/brain/paths.js — root del vault (default ./brain alla repo root, override BRAIN_DIR).
 * Il CODICE vive in src/ai/, i DATI restano in ./brain (mai spostare dati utenti).
 * Contenuti: skills/, memory/<guild>/, files/<guild>/, people/<guild>/, profile/<guild>/.
 * I contenuti utente sono dati: aggiungere `brain/` al .gitignore.
 */
const fs = require('fs');
const path = require('path');

function root() {
  return path.resolve(process.env.BRAIN_DIR || path.join(__dirname, '..', '..', '..', 'brain'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Risolve un path DENTRO il vault; rifiuta traversal/assoluti. Ritorna null se fuori. */
function inside(...parts) {
  const base = root();
  const clean = parts.map((p) => String(p || '').replace(/\\/g, '/'));
  if (clean.some((p) => !p || p.startsWith('/') || p.includes('..'))) return null;
  const full = path.resolve(base, ...clean);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

module.exports = { root, ensureDir, inside };
