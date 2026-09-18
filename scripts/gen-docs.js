'use strict';
/**
 * scripts/gen-docs.js — genera docs/COMMANDS.md scansionando src/commands.
 *
 * Per ogni comando: require del modulo, data.toJSON() (nome/descrizione/
 * opzioni/sottocomandi), export `cooldown`, categoria = nome della
 * sottocartella in src/commands. Output: una tabella Markdown per categoria.
 *
 * Uso: node scripts/gen-docs.js
 * Mai rete, mai login del bot, mai execute() dei comandi.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'src', 'commands');
const OUT_FILE = path.join(ROOT, 'docs', 'COMMANDS.md');

// ApplicationCommandOptionType (discord.js v14, valori numerici in toJSON()).
const OPTION_TYPE = {
  1: 'sottocomando',
  2: 'gruppo',
  3: 'stringa',
  4: 'intero',
  5: 'booleano',
  6: 'utente',
  7: 'canale',
  8: 'ruolo',
  9: 'menzionabile',
  10: 'numero',
  11: 'allegato',
};

function typeLabel(t) {
  return OPTION_TYPE[t] || `tipo:${t}`;
}

/** "nome: tipo*" — asterisco se obbligatoria. */
function fmtOption(o) {
  const req = o.required ? '*' : '';
  return `\`${o.name}: ${typeLabel(o.type)}${req}\``;
}

/**
 * Riepilogo opzioni/sottocomandi in italiano, una riga per tabella.
 * - Sottocomandi: "/nome — descrizione (opzioni: ...)" separati da <br>.
 * - Gruppi di sottocomandi: "gruppo.nome — descrizione (...)".
 * - Senza sottocomandi: elenco opzioni oppure "—".
 */
function fmtOptions(json) {
  const opts = Array.isArray(json.options) ? json.options : [];
  if (opts.length === 0) return '—';
  const subs = opts.filter((o) => o.type === 1 || o.type === 2);
  if (subs.length > 0) {
    return subs
      .map((s) => {
        if (s.type === 2) {
          const inner = (s.options || []).map((i) => `\`${i.name}\``).join(', ') || '—';
          return `**${s.name}** (${(s.options || []).length} sottocomandi: ${inner}) — ${s.description || ''}`;
        }
        const params = (s.options || []).map(fmtOption).join(', ') || 'nessun parametro';
        return `**${s.name}** — ${s.description || ''} (${params})`;
      })
      .join('<br>');
  }
  return opts.map(fmtOption).join(', ');
}

/** Escape pipe nelle celle Markdown (i <br> restano intencionali). */
function cell(v) {
  return String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function collectCommands(dir, category, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      collectCommands(full, e.name, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      let mod;
      try {
        delete require.cache[require.resolve(full)];
        mod = require(full);
      } catch (err) {
        console.warn(`[gen-docs] require fallito ${path.relative(ROOT, full)}: ${err.message.split('\n')[0]} (saltato)`);
        continue;
      }
      if (!mod || !mod.data || typeof mod.data.toJSON !== 'function') {
        console.warn(`[gen-docs] ${path.relative(ROOT, full)} senza data.toJSON() (saltato)`);
        continue;
      }
      let json;
      try {
        json = mod.data.toJSON();
      } catch (err) {
        console.warn(`[gen-docs] toJSON fallito ${path.relative(ROOT, full)}: ${err.message.split('\n')[0]} (saltato)`);
        continue;
      }
      out.push({
        name: json.name || path.basename(e.name, '.js'),
        description: json.description || '',
        options: fmtOptions(json),
        subCount: (Array.isArray(json.options) ? json.options.filter((o) => o.type === 1 || o.type === 2).length : 0),
        cooldown: typeof mod.cooldown === 'number' ? mod.cooldown : 3,
        category,
        file: path.relative(ROOT, full),
      });
    }
  }
}

function main() {
  if (!fs.existsSync(COMMANDS_DIR)) {
    console.error(`[gen-docs] directory comandi mancante: ${COMMANDS_DIR}`);
    process.exit(1);
  }
  const commands = [];
  collectCommands(COMMANDS_DIR, 'altri', commands);
  commands.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const byCat = new Map();
  for (const c of commands) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }

  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    '# Comandi del bot',
    '',
    `> Generato automaticamente con \`node scripts/gen-docs.js\` il ${now} — non modificare a mano.`,
    '>',
    `> Totale: **${commands.length} comandi** in **${byCat.size} categorie**.`,
    '> La categoria corrisponde alla sottocartella in src/commands/.',
    '> Cooldown in secondi per utente (default 3 s se non specificato nel modulo).',
    '> I parametri marcati con asterisco (*) sono obbligatori.',
    '',
    '## Indice categorie',
    '',
    ...[...byCat.keys()].map((c) => `- [${c}](#${c}) (${byCat.get(c).length})`),
    '',
  ];
  for (const [cat, list] of byCat) {
    lines.push(`## ${cat}`, '', `Comandi: ${list.length}`, '');
    lines.push('| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |');
    lines.push('|---|---|---|---|');
    for (const c of list) {
      lines.push(`| \`/${cell(c.name)}\` | ${cell(c.description)} | ${c.cooldown} s | ${cell(c.options)} |`);
    }
    lines.push('');
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  console.log(`[gen-docs] ${commands.length} comandi, ${byCat.size} categorie -> ${path.relative(ROOT, OUT_FILE)}`);
}

if (require.main === module) main();

module.exports = { fmtOptions, OPTION_TYPE };
