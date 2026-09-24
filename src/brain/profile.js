/**
 * brain/profile.js — scheda del server per il cervello.
 *
 * Due strati: snapshot AUTO (nome, membri, canali, lingua — ricalcolato ogni
 * volta, costo zero) + OVERRIDE staff (nota libera che integra/corregge).
 * L'override vive in `profile/<guildId>/override.md`, max 1000 char.
 * Mai lanciare: in errore ritorna '' (l'AI funziona comunque).
 */
const fs = require('fs');
const path = require('path');
const { ensureDir, inside } = require('./paths');

const MAX_OVERRIDE_CHARS = 1000;

function overrideFile(guildId) {
  const dir = inside('profile', String(guildId || ''));
  if (!dir) return null;
  return path.join(dir, 'override.md');
}

/** Override staff. '' se assente. Mai lancia. */
function getOverride(guildId) {
  try {
    const file = overrideFile(guildId);
    if (!file || !fs.existsSync(file)) return '';
    return String(fs.readFileSync(file, 'utf8') || '').trim().slice(0, MAX_OVERRIDE_CHARS);
  } catch {
    return '';
  }
}

/** Salva l'override staff. Lancia su input non valido. */
function saveOverride(guildId, text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) throw new Error('Profilo vuoto.');
  if (t.length > MAX_OVERRIDE_CHARS) throw new Error(`Profilo troppo lungo (max ${MAX_OVERRIDE_CHARS} caratteri).`);
  const dir = inside('profile', String(guildId || ''));
  const file = overrideFile(guildId);
  if (!dir || !file) throw new Error('Scope non valido.');
  ensureDir(dir);
  fs.writeFileSync(file, `${t.slice(0, MAX_OVERRIDE_CHARS)}\n`);
  return t;
}

/** Rimuove l'override. Ritorna true se esisteva. */
function clearOverride(guildId) {
  try {
    const file = overrideFile(guildId);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot puro da un oggetto guild (discord.js o mock con stessi campi).
 * Testabile senza Discord. Ritorna '' se guild assente.
 */
function snapshotGuild(guild) {
  try {
    if (!guild) return '';
    const parts = [];
    if (guild.name) parts.push(`Server "${String(guild.name).slice(0, 80)}"`);
    if (Number.isFinite(guild.memberCount)) parts.push(`${guild.memberCount} membri`);
    if (guild.preferredLocale) parts.push(`lingua ${guild.preferredLocale}`);
    let channels = [];
    try {
      const cache = guild.channels && guild.channels.cache;
      if (cache && typeof cache.filter === 'function') {
        channels = cache
          .filter((c) => c && (c.type === 0 || c.type === 'GUILD_TEXT'))
          .map((c) => String(c.name || '').slice(0, 40))
          .filter(Boolean)
          .slice(0, 15);
      } else if (Array.isArray(guild.channels)) {
        channels = guild.channels.map(String).slice(0, 15);
      }
    } catch { channels = []; }
    if (channels.length) parts.push(`canali: ${channels.map((c) => `#${c}`).join(', ')}`);
    if (!parts.length) return '';
    return parts.join(' · ').slice(0, 600);
  } catch {
    return '';
  }
}

/** Scheda completa: snapshot + override. '' se vuota. Mai lancia. */
function getProfile(guild, guildId) {
  try {
    const snap = snapshotGuild(guild);
    const over = getOverride(guildId || (guild && guild.id));
    const text = [snap, over ? `Note dello staff: ${over}` : ''].filter(Boolean).join('\n');
    return text.slice(0, 1600);
  } catch {
    return '';
  }
}

module.exports = {
  getProfile, snapshotGuild, getOverride, saveOverride, clearOverride,
  MAX_OVERRIDE_CHARS,
};
