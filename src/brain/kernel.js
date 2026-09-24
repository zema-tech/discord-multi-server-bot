/**
 * brain/kernel.js — il "cervello": compone il contesto AI del server da
 * skill + memorie + file del vault + profilo server + fatti della persona,
 * entro un budget di caratteri.
 *
 *   buildContext({ guildId, query, budget, userId, guild }) ->
 *     { system, sources: [{ type:'skill'|'memoria'|'file'|'profilo'|'persona', name, excerpt }] }
 *
 * `userId`/`guild` sono opzionali (retrocompatibile): senza, niente
 * persona/profilo. Mai lanciare: in errore ritorna contesto vuoto.
 */
const { matchSkills } = require('./skills');
const { searchNotes } = require('./memory');
const { matchFiles } = require('./files');
const { getProfile } = require('./profile');
const { getFacts } = require('./people');

const DEFAULT_BUDGET = 4000;

function excerpt(text, max) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function buildContext({ guildId, query, budget = DEFAULT_BUDGET, userId = null, guild = null } = {}) {
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
    // Profilo del server (sempre pertinente, piccolo) + fatti della persona.
    const profilo = getProfile(guild, guildId);
    if (profilo) {
      const item = take({ type: 'profilo', name: 'server', excerpt: profilo });
      if (item) sources.push(item);
    }
    if (userId) {
      const facts = getFacts(guildId, userId).slice(0, 10);
      if (facts.length) {
        const item = take({ type: 'persona', name: 'fatti', excerpt: `Cose che sai di questa persona: ${facts.join('; ')}` });
        if (item) sources.push(item);
      }
    }
  } catch {
    return { system: '', sources: [] };
  }

  if (!sources.length) return { system: '', sources };
  const system =
    'Contesto dal cervello del server (profilo, skill, memorie, file e fatti della persona). ' +
    'Usalo per rispondere in modo pertinente; se contraddice la domanda, ignora la parte non pertinente.\n' +
    sources.map((s) => `[${s.type}: ${s.name}]\n${s.excerpt}`).join('\n\n');
  return { system, sources };
}

function sourcesLine(sources) {
  if (!sources || !sources.length) return '';
  const icons = { skill: '🧠', memoria: '📝', file: '📄', profilo: '🏰', persona: '🧑' };
  return sources.map((s) => `${icons[s.type] || '•'} ${s.name}`).join(' · ');
}

module.exports = { buildContext, sourcesLine, DEFAULT_BUDGET };
