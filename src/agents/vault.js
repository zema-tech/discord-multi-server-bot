'use strict';
/**
 * src/agents/vault.js — Cassaforte credenziali per i login degli agenti.
 *
 * Principio: l'agente NON vede mai i segreti. Il proprietario salva una
 * credenziale (es. token API di un servizio); quando serve, il broker la
 * inietta in una chiamata HTTPS e restituisce all'agente solo l'esito.
 * Ogni uso richiede approvazione umana (vedi tools.useService).
 *
 * Cifratura: AES-256-GCM, chiave da VAULT_KEY (min 16 caratteri).
 * Senza VAULT_KEY il vault è disabilitato con messaggio chiaro.
 * File: data/vault.json (0600, gitignored come tutta data/).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function vaultPath() {
  return path.join(process.cwd(), 'data', 'vault.json');
}

function keyBytes() {
  const raw = process.env.VAULT_KEY || '';
  if (raw.length < 16) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function isEnabled() {
  return !!keyBytes();
}

function load() {
  try {
    const raw = fs.readFileSync(vaultPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      return parsed.entries;
    }
  } catch {}
  return {};
}

function save(entries) {
  const dir = path.dirname(vaultPath());
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  try {
    fs.writeFileSync(vaultPath(), JSON.stringify({ version: 1, entries }, null, 2), { mode: 0o600 });
  } catch {
    fs.writeFileSync(vaultPath(), JSON.stringify({ version: 1, entries }, null, 2));
  }
  try {
    fs.chmodSync(vaultPath(), 0o600);
  } catch {}
}

function entryKey(service, account) {
  return `${String(service).toLowerCase().slice(0, 80)}::${String(account || 'default').slice(0, 80)}`;
}

/** Salva (sovrascrive) un segreto. Solo il proprietario, mai l'agente. */
function storeSecret(service, account, secret) {
  if (!isEnabled()) throw new Error('Vault disabilitato: imposta VAULT_KEY (min 16 caratteri) nel .env.');
  const s = String(secret || '');
  if (!s) throw new Error('Segreto vuoto.');
  if (s.length > 4000) throw new Error('Segreto troppo lungo (max 4000).');
  const key = keyBytes();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const entries = load();
  entries[entryKey(service, account)] = {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
    updatedAt: new Date().toISOString(),
  };
  save(entries);
  audit('store', service, account);
  return true;
}

function decrypt(entry) {
  const key = keyBytes();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(entry.data, 'base64')), decipher.final()]).toString('utf8');
}

function hasSecret(service, account) {
  if (!isEnabled()) return false;
  return !!load()[entryKey(service, account)];
}

/** Solo nomi (mai valori): per la control-room. */
function listServices() {
  const out = [];
  try {
    for (const k of Object.keys(load())) {
      const [service, account] = k.split('::');
      out.push({ service, account });
    }
  } catch {}
  return out.sort((a, b) => (a.service + a.account < b.service + b.account ? -1 : 1));
}

function removeSecret(service, account) {
  const entries = load();
  const k = entryKey(service, account);
  if (!entries[k]) return false;
  delete entries[k];
  save(entries);
  audit('remove', service, account);
  return true;
}

/**
 * Esegue `fn(secret)` con il segreto in chiaro e lo dimentica subito dopo.
 * Chiamabile solo dal broker (tools.useService), dopo approvazione umana.
 */
async function withSecret({ agentId, sessionId, service, account }, fn) {
  if (!isEnabled()) throw new Error('Vault disabilitato: imposta VAULT_KEY nel .env.');
  const entry = load()[entryKey(service, account)];
  if (!entry) throw new Error(`Nessuna credenziale per "${service}" (${account || 'default'}).`);
  let secret;
  try {
    secret = decrypt(entry);
  } catch {
    throw new Error('Vault illeggibile: VAULT_KEY errata o file corrotto.');
  }
  audit('use', service, account, agentId, sessionId);
  try {
    return await fn(secret);
  } finally {
    secret = null; // best-effort: niente riferimenti trattenuti
  }
}

/** Audit: servizio+account+agente, MAI valori. */
function audit(op, service, account, agentId, sessionId) {
  try {
    require('../utils/logger').info('Vault', {
      op,
      service: String(service).slice(0, 80),
      account: String(account || 'default').slice(0, 80),
      agent: agentId || null,
      session: sessionId || null,
    });
  } catch {}
}

module.exports = { isEnabled, storeSecret, hasSecret, listServices, removeSecret, withSecret };
