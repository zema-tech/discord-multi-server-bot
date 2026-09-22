'use strict';
/**
 * src/dashboard/guilds.js — Sorgente dati guild per la dashboard.
 *
 * Astrae DA DOVE vengono i dati Discord così api.js non deve saperlo:
 *   - fromClient(client): processo bot (cache discord.js in memoria).
 *   - fromRest(): processo standalone (roster da presence.js + REST bot-token).
 *
 * Interfaccia (tutto best-effort, mai lanciare):
 *   listGuilds() -> [{ id, name, icon, memberCount|null }]
 *   getGuild(gid) -> { id, name, icon, memberCount|null } | null
 *   getChannels(gid) -> [{ id, name, type }]            (async)
 *   getRoles(gid) -> [{ id, name, color, managed }]     (async)
 *   counts(gid) -> { channels, roles, commands }        (async)
 *
 * Ritorna true se `o` è già una source (duck-typing), per compatibilità.
 */

function isSource(o) {
  return Boolean(o) && typeof o.listGuilds === 'function' && typeof o.getGuild === 'function';
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------- fromClient
function fromClient(client) {
  function cache() {
    try {
      return client && client.guilds && client.guilds.cache ? client.guilds.cache : null;
    } catch {
      return null;
    }
  }

  function toCard(g) {
    if (!g || !g.id) return null;
    return {
      id: String(g.id),
      name: typeof g.name === 'string' ? g.name : String(g.id),
      icon: g.icon ? String(g.icon) : null,
      memberCount: numOrNull(g.memberCount),
    };
  }

  return {
    kind: 'client',

    listGuilds() {
      try {
        const c = cache();
        if (!c) return [];
        const out = [];
        for (const g of c.values()) {
          const card = toCard(g);
          if (card) out.push(card);
        }
        return out;
      } catch {
        return [];
      }
    },

    getGuild(gid) {
      try {
        const c = cache();
        if (!c || typeof c.get !== 'function') return null;
        return toCard(c.get(gid));
      } catch {
        return null;
      }
    },

    async getChannels(gid) {
      try {
        const c = cache();
        const g = c && typeof c.get === 'function' ? c.get(gid) : null;
        const ch = g && g.channels && g.channels.cache;
        if (!ch) return [];
        const out = [];
        for (const v of ch.values()) {
          if (v && v.id) out.push({ id: String(v.id), name: String(v.name || v.id), type: v.type });
        }
        return out;
      } catch {
        return [];
      }
    },

    async getRoles(gid) {
      try {
        const c = cache();
        const g = c && typeof c.get === 'function' ? c.get(gid) : null;
        const rl = g && g.roles && g.roles.cache;
        if (!rl) return [];
        const out = [];
        for (const v of rl.values()) {
          if (v && v.id && v.id !== gid) {
            out.push({ id: String(v.id), name: String(v.name || v.id), color: v.color || 0, managed: Boolean(v.managed) });
          }
        }
        out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return out;
      } catch {
        return [];
      }
    },

    async counts(gid) {
      let channels = 0;
      let roles = 0;
      try {
        const c = cache();
        const g = c && typeof c.get === 'function' ? c.get(gid) : null;
        channels = g && g.channels && g.channels.cache ? g.channels.cache.size : 0;
        roles = g && g.roles && g.roles.cache ? Math.max(g.roles.cache.size - 1, 0) : 0;
      } catch { /* zeri */ }
      let commands = 0;
      try {
        if (client && typeof client.commands?.size === 'number') commands = client.commands.size;
      } catch { /* zero */ }
      return { channels, roles, commands };
    },
  };
}

// ------------------------------------------------------------------ fromRest
const REST_TTL_MS = 60 * 1000;
const restCache = new Map(); // key -> { exp, value }

function restCached(key, loader) {
  const now = Date.now();
  const hit = restCache.get(key);
  if (hit && hit.exp > now) return hit.value;
  const p = (async () => {
    try {
      return await loader();
    } catch (e) {
      restCache.delete(key);
      throw e;
    }
  })();
  restCache.set(key, { exp: now + REST_TTL_MS, value: p });
  // Evita crescita infinita in caso di molte guild.
  if (restCache.size > 200) {
    const first = restCache.keys().next();
    if (!first.done) restCache.delete(first.value);
  }
  return p;
}

function safeRequire(relPath) {
  try {
    return require(relPath);
  } catch {
    return null;
  }
}

function fromRest() {
  const presence = safeRequire('./presence');
  const rest = safeRequire('./discordRest');

  function roster() {
    try {
      const snap = presence ? presence.readPresence() : null;
      if (snap && Array.isArray(snap.guilds)) {
        return snap.guilds.filter((g) => g && g.id).map((g) => ({
          id: String(g.id),
          name: typeof g.name === 'string' ? g.name : String(g.id),
          icon: typeof g.icon === 'string' ? g.icon : null,
          memberCount: numOrNull(g.memberCount),
        }));
      }
    } catch { /* sotto */ }
    return [];
  }

  return {
    kind: 'rest',

    listGuilds() {
      return roster();
    },

    async getGuild(gid) {
      const base = roster().find((g) => g.id === String(gid));
      if (!base) return null;
      if (!rest) return base;
      try {
        const live = await restCached(`guild:${gid}`, () => rest.getGuild(gid));
        if (live) {
          return {
            id: base.id,
            name: live.name || base.name,
            icon: live.icon !== undefined ? live.icon : base.icon,
            memberCount: numOrNull(live.memberCount),
          };
        }
      } catch { /* fallback roster */ }
      return base;
    },

    async getChannels(gid) {
      if (!rest) return [];
      try {
        return await restCached(`channels:${gid}`, () => rest.getChannels(gid));
      } catch {
        return [];
      }
    },

    async getRoles(gid) {
      if (!rest) return [];
      try {
        const roles = await restCached(`roles:${gid}`, () => rest.getRoles(gid));
        const out = (Array.isArray(roles) ? roles : []).filter((r) => r.id !== String(gid));
        out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return out;
      } catch {
        return [];
      }
    },

    async counts(gid) {
      let channels = 0;
      let roles = 0;
      try {
        const [ch, rl] = await Promise.all([this.getChannels(gid), this.getRoles(gid)]);
        channels = ch.length;
        roles = rl.length;
      } catch { /* zeri */ }
      return { channels, roles, commands: 0 };
    },
  };
}

module.exports = { isSource, fromClient, fromRest };
