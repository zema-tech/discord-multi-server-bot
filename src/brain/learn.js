/**
 * brain/learn.js — auto-apprendimento conservativo: estrae UN fatto stabile
 * da un messaggio ("ricordati che odio il giallo", "sono allergico alle noci").
 *
 * Solo affermazioni forti in prima persona o trigger espliciti. Ignora:
 * domande, comandi (/...), menzioni @everyone/@here, messaggi con link
 * o troppo lunghi. Mai lancia: ritorna il fatto o null.
 */
const people = require('./people');

const MAX_INPUT = 300;

// "ricordati che X", "ricorda che X", "remember that X", "memorizza che X"
const EXPLICIT_RE = /^(?:ricordat[ie]?(?:ti|e)?|memorizza|remember)\s+(?:che|that)\s+(.+)$/i;

// "odio X", "amo X", "adoro X", "detesto X"
const TASTE_RE = /^(?:io\s+)?(odio|amo|adoro|detesto|non\s+sopporto)\s+(.+)$/i;

// "sono X" stabile: allergico, vegetariano, vegano, celiaco, diabetico...
const TRAIT_RE = /^(?:io\s+)?sono\s+(allergico|allergic[oaie]|vegetariano|vegan[oaie]|celiac[oaie]|diabetic[oaie])\b(.*)$/i;

// "il mio X è Y": compleanno, nome, colore preferito, gioco preferito, lavoro...
const MIO_RE = /^il\s+mio\s+(compleanno|nome|colore\s+preferito|gioco\s+preferito|cibo\s+preferito|film\s+preferito|animale\s+preferito|lavoro)\s+(?:è|e['’])\s*(.+)$/i;

// "mi chiamo X", "lavoro come X", "faccio il X", "tifo X", "studio X"
const ROLE_RE = /^(?:mi\s+chiamo|lavoro\s+come|faccio\s+(?:il|lo|l[a'])\s*|tifo(?:\s+per)?|studio)\s+(.+)$/i;

/** Estrae un fatto candidabile da un messaggio. Ritorna stringa o null. */
function extractFact(text) {
  try {
    let t = String(text || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > MAX_INPUT) return null;
    if (/^[/?!.]/.test(t)) return null; // comandi, domande secche
    if (/<@!?&?\d+>|@everyone|@here|https?:\/\/|discord\.gg\//i.test(t)) return null;
    if (/\?\s*$/.test(t)) return null; // domanda

    let m = EXPLICIT_RE.exec(t);
    if (m && m[1].trim()) return normalize(m[1]);

    m = TASTE_RE.exec(t);
    if (m && m[2].trim()) {
      const verb = m[1].toLowerCase().replace(/\s+/g, ' ');
      return normalize(`${verb} ${m[2].trim()}`);
    }

    m = TRAIT_RE.exec(t);
    if (m) return normalize(`è ${m[1].toLowerCase()}${m[2] ? ` ${m[2].trim()}` : ''}`);

    m = MIO_RE.exec(t);
    if (m && m[2].trim()) return normalize(`il suo ${m[1].toLowerCase()} è ${m[2].trim()}`);

    m = ROLE_RE.exec(t);
    if (m && m[1].trim()) {
      const head = t.toLowerCase().startsWith('mi chiamo') ? 'si chiama'
        : t.toLowerCase().startsWith('tifo') ? 'tifa'
        : t.toLowerCase().startsWith('studio') ? 'studia' : 'lavora come';
      return normalize(`${head} ${m[1].trim()}`);
    }
    return null;
  } catch {
    return null;
  }
}

function normalize(fact) {
  let f = String(fact || '').trim().replace(/\s+/g, ' ').replace(/[.。!؟]+$/, '');
  if (f.length < 3 || f.length > people.MAX_FACT_CHARS) return null;
  return f;
}

/**
 * Tenta di apprendere dal messaggio: estrae e salva. Ritorna il fatto
 * salvato, 'dup' se già noto, null se niente da imparare. Mai lancia.
 */
function learnFrom(guildId, userId, text, displayName = '') {
  try {
    if (!guildId || !userId) return null;
    const fact = extractFact(text);
    if (!fact) return null;
    const saved = people.saveFact(guildId, userId, fact, displayName);
    return saved ? fact : 'dup';
  } catch {
    return null;
  }
}

module.exports = { extractFact, learnFrom };
