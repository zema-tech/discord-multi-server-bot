/**
 * brain/kernel.js — il "cervello": compone il contesto AI del server da
 * skill + memorie + file del vault, entro un budget di caratteri.
 *
 *   buildContext({ guildId, query, budget }) ->
 *     { system, sources: [{ type:'skill'|'memoria'|'file', name, excerpt }] }
 *
 * Mai lanciare: in errore ritorna contesto vuoto (l'AI funziona comunque).
 */
const { matchSkills } = require('./skills');
const { searchNotes } = require('./memory');
const { matchFiles } = require('./files');

const DEFAULT_BUDGET = 4000;

function excerpt(text, max) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function buildContext({ guildId, query, budget = DEFAULT_BUDGET } = {}) {
  const sources = [];
  let used = 0;
  const take = (item) => {
    const room = budget - used;
    if (room <= 100) return null;
    const cut = excerpt(item.excerpt, Math.min(item.excerpt.length, room));
    used += cut.length;
    return { ...item, excerpt: cut };
  };
  try {
    if (!guildId || !String(query || '').trim()) return { system: '', sources };
    const q = String(query);

    for (const s of matchSkills(guildId, q, 2)) {
      const item = take({
        type: 'skill', name: s.name,
        excerpt: `Skill "${s.name}" (${s.description}): ${s.instructions}`,
      });
      if (item) sources.push(item);
    }
    for (const { note } of searchNotes(guildId, q, 3)) {
      const item = take({
        type: 'memoria', name: note.title,
        excerpt: `Nota "${note.title}"${note.tags.length ? ` [#${note.tags.join(' #')}]` : ''}: ${note.body}`,
      });
      if (item) sources.push(item);
    }
    for (const f of matchFiles(guildId, q, 2)) {
      const item = take({ type: 'file', name: f.name, excerpt: `File "${f.name}": ${f.excerpt}` });
      if (item) sources.push(item);
    }
  } catch {
    return { system: '', sources: [] };
  }

  if (!sources.length) return { system: '', sources };
  const system =
    'Contesto dal cervello del server (skill, memorie e file caricati dallo staff). ' +
    'Usalo per rispondere in modo pertinente; se contraddice la domanda, ignora la parte non pertinente.\n' +
    sources.map((s) => `[${s.type}: ${s.name}]\n${s.excerpt}`).join('\n\n');
  return { system, sources };
}

function sourcesLine(sources) {
  if (!sources || !sources.length) return '';
  const icons = { skill: '🧠', memoria: '📝', file: '📄' };
  return sources.map((s) => `${icons[s.type] || '•'} ${s.name}`).join(' · ');
}

module.exports = { buildContext, sourcesLine, DEFAULT_BUDGET };
