#!/usr/bin/env node
'use strict';
/**
 * scripts/setup.js — wizard `npm run setup` stile opencode: zero-config + override.
 *
 * Rileva l'host, verifica il token live, scrive .env (con backup .env.bak),
 * raccomanda lo storage. Idempotente: rieseguibile, non cancella mai chiavi
 * esistenti senza consenso. Funzioni pure esportate per i test.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { detectHost, recommendStorage, tokenLooksValid, checkTokenLive } = require('../src/host');

const ROOT = path.join(__dirname, '..');

function ask(rl, q, def = '') {
  return new Promise((resolve) => {
    const hint = def ? ` [${def}]` : '';
    rl.question(`${q}${hint}: `, (a) => resolve(a.trim() || def));
  });
}

function mask(v) {
  const s = String(v || '');
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Legge .env in {k:v} preservando ordine/commenti grezzi per la riscrittura. */
function readEnvFile(file) {
  const out = { order: [], values: {}, raw: '' };
  try {
    out.raw = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of out.raw.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) {
      if (!out.order.includes(m[1])) out.order.push(m[1]);
      out.values[m[1]] = m[2];
    }
  }
  return out;
}

/** Scrive .env unendo esistenti + nuovi (i nuovi vincono). Backup .env.bak. */
function writeEnvFile(file, values) {
  const prev = readEnvFile(file);
  const merged = { ...prev.values, ...values };
  const keys = [...prev.order];
  for (const k of Object.keys(values)) if (!keys.includes(k)) keys.push(k);
  const body = keys.map((k) => `${k}=${merged[k] ?? ''}`).join('\n') + '\n';
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  } catch {}
  fs.writeFileSync(file, body);
  return { written: keys.length, backup: fs.existsSync(`${file}.bak`) };
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n🤖 Setup bot — rilevamento host + configurazione\n');
  const host = detectHost();
  console.log(`Host rilevato: ${host.name} (${host.id})`);
  const rec = recommendStorage(host);
  console.log(`Storage raccomandato: ${rec.backend}${rec.path ? ` (${rec.path})` : ''}`);
  if (rec.warning) console.log(`⚠️  ${rec.warning}`);

  const envPath = path.join(ROOT, '.env');
  const existing = readEnvFile(envPath);
  if (Object.keys(existing.values).length) {
    console.log(`\nTrovato .env esistente (${Object.keys(existing.values).length} chiavi): verrà aggiornato, mai svuotato.`);
  }

  // --- Token (verifica live) ---
  let token = '';
  for (let i = 0; i < 3 && !token; i += 1) {
    const t = await ask(rl, 'DISCORD_TOKEN dal Developer Portal', existing.values.DISCORD_TOKEN || '');
    if (!tokenLooksValid(t)) {
      console.log('❌ Formato strano (atteso xxx.yyy.zzz). Riprova.');
      continue;
    }
    process.stdout.write('Verifica live su Discord… ');
    const live = await checkTokenLive(t);
    if (live.ok) {
      console.log(`✅ Bot: ${live.tag}`);
      token = t;
    } else {
      console.log(`❌ ${live.error}`);
      const keep = await ask(rl, 'Tenerlo comunque? (s/N)', 'N');
      if (/^s/i.test(keep)) token = t;
    }
  }
  if (!token) {
    console.log('Setup annullato: serve un token.');
    rl.close();
    process.exitCode = 1;
    return;
  }

  const clientId = await ask(rl, 'CLIENT_ID (per deploy comandi)', existing.values.CLIENT_ID || '');
  const out = { DISCORD_TOKEN: token };
  if (clientId) out.CLIENT_ID = clientId;
  out.DB_BACKEND = rec.backend;
  if (rec.path) out.DB_SQLITE_PATH = rec.path;

  // --- AI (opzionale) ---
  const aiKey = await ask(rl, 'Chiave AI (GROQ/OpenAI/Gemini, invio = gratis Pollinations)', '');
  if (aiKey) {
    if (/^gsk_/.test(aiKey)) out.GROQ_API_KEY = aiKey;
    else if (/^sk-ant-/.test(aiKey)) out.ANTHROPIC_API_KEY = aiKey;
    else if (/^sk-/.test(aiKey)) out.OPENAI_API_KEY = aiKey;
    else out.GROQ_API_KEY = aiKey;
  }

  // --- Dashboard (opzionale) ---
  const dash = await ask(rl, 'Attivare dashboard web? (s/N)', existing.values.DASHBOARD_PORT ? 's' : 'N');
  if (/^s/i.test(dash)) {
    out.DASHBOARD_PORT = existing.values.DASHBOARD_PORT || '3000';
    out.SESSION_SECRET = existing.values.SESSION_SECRET || randomSecret();
    out.CLIENT_SECRET = await ask(rl, 'CLIENT_SECRET (OAuth2)', existing.values.CLIENT_SECRET || '');
    out.BASE_URL = await ask(rl, 'BASE_URL (es. http://localhost:3000)', existing.values.BASE_URL || `http://localhost:${out.DASHBOARD_PORT}`);
  }

  const res = writeEnvFile(envPath, out);
  console.log(`\n✅ .env scritto (${res.written} chiavi${res.backup ? ', backup in .env.bak' : ''}).`);
  console.log(`   Token: ${mask(token)} · Storage: ${out.DB_BACKEND} · Host: ${host.id}`);
  console.log('\nProssimi passi:\n  1. node deploy-commands.js' + (clientId ? '' : '  (serve CLIENT_ID)') + '\n  2. npm start' + (out.DASHBOARD_PORT ? '  (+ npm run dashboard)' : ''));
  rl.close();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`Setup fallito: ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { readEnvFile, writeEnvFile, randomSecret, mask };
