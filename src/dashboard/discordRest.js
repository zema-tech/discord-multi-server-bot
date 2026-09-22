'use strict';
/**
 * src/dashboard/discordRest.js — Chiamate REST a Discord con Bot token.
 *
 * Usato dal processo dashboard standalone (senza gateway proprio) per
 * leggere canali, ruoli e conteggi dei server. Solo GET, mai scritture.
 * Errori con .status HTTP (401/403/404/429/5xx) o senza status (rete/timeout).
 *
 * Niente dipendenze: fetch globale + AbortController (timeout 15s).
 */

const DISCORD_API = 'https://discord.com/api/v10';
const FETCH_TIMEOUT_MS = 15000;

function token() {
  return process.env.DISCORD_TOKEN || '';
}

/** fetch con timeout: abort + errore chiaro in italiano. */
async function fetchJson(apiPath) {
  const t = token();
  if (!t) {
    const e = new Error('DISCORD_TOKEN mancante: la dashboard standalone non può leggere i dati Discord.');
    e.status = 500;
    throw e;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${DISCORD_API}${apiPath}`, {
      headers: {
        Authorization: `Bot ${t}`,
        'User-Agent': 'discord-multi-server-bot-dashboard/1.0',
      },
      signal: controller.signal,
    });
    if (r.status === 429) {
      const e = new Error('Discord rate-limit (429), riprova tra poco.');
      e.status = 429;
      throw e;
    }
    if (!r.ok) {
      const e = new Error(`Discord API ${apiPath}: HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const t2 = new Error('Discord non risponde (timeout 15s), riprova più tardi.');
      throw t2;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function asId(v) {
  return typeof v === 'string' && v ? v : null;
}

/** Guild con conteggi (with_counts=true): id, name, icon, memberCount. */
async function getGuild(gid) {
  const g = await fetchJson(`/guilds/${encodeURIComponent(gid)}?with_counts=true`);
  if (!g || !g.id) return null;
  return {
    id: String(g.id),
    name: typeof g.name === 'string' ? g.name : String(g.id),
    icon: typeof g.icon === 'string' ? g.icon : null,
    memberCount: Number.isFinite(g.approximate_member_count) ? g.approximate_member_count : null,
  };
}

/** Canali: [{ id, name, type }]. */
async function getChannels(gid) {
  const list = await fetchJson(`/guilds/${encodeURIComponent(gid)}/channels`);
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && c.id)
    .map((c) => ({
      id: String(c.id),
      name: typeof c.name === 'string' ? c.name : String(c.id),
      type: Number.isFinite(c.type) ? c.type : 0,
    }));
}

/** Ruoli (escluso @everyone qui? no: lo filtra il chiamante come prima). */
async function getRoles(gid) {
  const list = await fetchJson(`/guilds/${encodeURIComponent(gid)}/roles`);
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && r.id)
    .map((r) => ({
      id: String(r.id),
      name: typeof r.name === 'string' ? r.name : String(r.id),
      color: Number.isFinite(r.color) ? r.color : 0,
      managed: Boolean(r.managed),
    }));
}

module.exports = { getGuild, getChannels, getRoles };
