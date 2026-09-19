/**
 * brain/compendio.js — la memoria a lungo termine del self-improvement:
 * principi di revisione + lezioni apprese da ogni run (successi E rollback).
 * Il job lo legge PRIMA di proporre e lo aggiorna DOPO: così l'agente
 * diventa più forte col tempo invece di ripetere gli stessi errori.
 *
 *   brain/compendio/principi.md        (seed automatico, poi editabile)
 *   brain/compendio/lezioni/<id>.md    (una per esito utile, max 50)
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, inside } = require('./paths');

const MAX_LESSONS = 50;
const MAX_CONTEXT_CHARS = 3000;

const PRINCIPI_DEFAULT = `# Principi di revisione

Regole che il revisore notturno segue sempre (le lezioni sotto affinano questi principi):

1. Piccolo e sicuro: una sola patch per run, blocco unico contiguo, max 40 righe di differenza.
2. Mai rompere: allowlist solo su comandi e utility non critiche; niente nuove dipendenze, rete, env o comportamenti.
3. Prove prima di tutto: ogni patch deve passare sintassi e smoke test, altrimenti rollback immediato.
4. Onestà nei verdetti: se niente merita davvero, dichiara "niente da migliorare" invece di inventare modifiche.
5. Impara dal passato: leggi le lezioni sotto e NON riproporre patch già revertite o rifiutate per lo stesso motivo.
`;

function compendioDir() {
  const dir = inside('compendio');
  if (!dir) return null;
  return ensureDir(dir);
}

function lezioniDir() {
  const base = compendioDir();
  if (!base) return null;
  const dir = path.join(base, 'lezioni');
  return ensureDir(dir);
}

/** Principi (seed automatico alla prima lettura, mai sovrascritti). */
function getPrincipi() {
  try {
    const base = compendioDir();
    if (!base) return PRINCIPI_DEFAULT;
    const file = path.join(base, 'principi.md');
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, PRINCIPI_DEFAULT);
      return PRINCIPI_DEFAULT.trim();
    }
    const content = fs.readFileSync(file, 'utf8').trim();
    return content || PRINCIPI_DEFAULT;
  } catch {
    return PRINCIPI_DEFAULT;
  }
}

function parseLesson(raw, id) {
  const text = String(raw || '');
  const lesson = { id, tipo: 'nota', ambito: '', verdict: '', body: '' };
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  let body = text;
  if (m) {
    body = m[2] || '';
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === 'tipo' && /^(successo|errore|principio)$/.test(v)) lesson.tipo = v;
      else if (k === 'ambito') lesson.ambito = v.slice(0, 120);
      else if (k === 'verdict') lesson.verdict = v.slice(0, 40);
      else if (k === 'data') lesson.data = v.slice(0, 40);
    }
  }
  lesson.body = body.trim().slice(0, 800);
  return lesson;
}

function listLessons(limit = 20) {
  const dir = inside('compendio', 'lezioni');
  if (!dir || !fs.existsSync(dir)) return [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse();
  } catch {
    return [];
  }
  const out = [];
  for (const f of files.slice(0, Math.max(1, limit))) {
    try {
      out.push(parseLesson(fs.readFileSync(path.join(dir, f), 'utf8'), path.basename(f, '.md')));
    } catch {}
  }
  return out;
}

/**
 * Registra una lezione da un esito run. Deduplica: se una lezione identica
 * (verdict+ambito+testo) esiste già nelle ultime 5, non scrive.
 * Ritorna id oppure null (duplicata/errore).
 */
function recordLesson({ verdict, file, reason, detail }) {
  try {
    const dir = lezioniDir();
    if (!dir) return null;
    const tipo = verdict === 'applied' ? 'successo' : verdict === 'reverted' ? 'errore' : 'nota';
    const ambito = String(file || '').slice(0, 120);
    const body = String(reason || detail || '').trim().slice(0, 800);
    if (!body) return null;
    const recent = listLessons(5);
    const dup = recent.some(
      (l) => l.verdict === verdict && l.ambito === ambito && l.body === body
    );
    if (dup) return null;
    // Suffisso random: due run ravvicinate condividono lo stesso millisecondo.
    const id = `lezione-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const content =
      `---\ntipo: ${tipo}\nambito: ${ambito}\nverdict: ${verdict}\ndata: ${new Date().toISOString()}\n---\n${body}\n`;
    fs.writeFileSync(path.join(dir, `${id}.md`), content);
    // Prune: tieni le più recenti.
    try {
      const all = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
      for (const old of all.slice(0, Math.max(0, all.length - MAX_LESSONS))) {
        try {
          fs.unlinkSync(path.join(dir, old));
        } catch {}
      }
    } catch {}
    return id;
  } catch {
    return null;
  }
}

/** Contesto pronto per il system prompt (principi + lezioni recenti, cappato). */
function loadContext(maxChars = MAX_CONTEXT_CHARS) {
  try {
    const parts = [];
    const princ = getPrincipi().trim();
    if (princ) parts.push(`PRINCIPI:\n${princ}`);
    const lessons = listLessons(15);
    if (lessons.length) {
      parts.push(
        'LEZIONI DALLE RUN PRECEDENTI (rispettale, non ripetere gli errori):\n' +
          lessons.map((l) => `- [${l.tipo}] ${l.ambito ? l.ambito + ': ' : ''}${l.body}`).join('\n')
      );
    }
    const full = parts.join('\n\n').trim();
    return full.length > maxChars ? full.slice(0, maxChars) + '…' : full;
  } catch {
    return '';
  }
}

function stats() {
  const lessons = listLessons(MAX_LESSONS);
  return {
    total: lessons.length,
    successi: lessons.filter((l) => l.tipo === 'successo').length,
    errori: lessons.filter((l) => l.tipo === 'errore').length,
    cap: MAX_LESSONS,
  };
}

module.exports = {
  getPrincipi, listLessons, recordLesson, loadContext, stats,
  PRINCIPI_DEFAULT, MAX_LESSONS,
};
