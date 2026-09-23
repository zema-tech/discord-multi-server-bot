import { createRequire } from "node:module";
import path from "node:path";

/**
 * @repo/db — query condivise bot ↔ dashboard (regola di bromso: si scrive SOLO da qui).
 *
 * FASE 1: file-adapter. Delega ai moduli esistenti in STORE_DIR
 * (`src/database/*.js`, API sync). Stessi dati, zero migrazione.
 * FASE 2: gli stessi nomi di funzione parleranno a Postgres/Drizzle
 * (`schema.ts`); i chiamanti non cambiano.
 */

const require = createRequire(import.meta.url);
const STORE_DIR = process.env.STORE_DIR ?? "./src/database";

function mod<T = Record<string, (...a: never[]) => unknown>>(name: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.resolve(STORE_DIR, `${name}.js`)) as T;
}

export type FeatureId = "welcome" | "autoRole" | "moderation" | "leveling" | "logs";

/** Mappa feature dashboard → modulo store esistente. */
const FEATURE_STORE: Record<FeatureId, string> = {
  welcome: "guildConfig",
  autoRole: "autorole",
  moderation: "guildConfig",
  leveling: "levelRewards",
  logs: "guildConfig",
};

export function getFeatureSettings(guildId: string, feature: FeatureId): Record<string, unknown> {
  const store = mod(FEATURE_STORE[feature]);
  const getters: Record<FeatureId, string> = {
    welcome: "getGuild",
    autoRole: "getConfig",
    moderation: "getGuild",
    leveling: "listRewards",
    logs: "getGuild",
  };
  const fn = store[getters[feature]] as ((g: string) => unknown) | undefined;
  if (typeof fn !== "function") return {};
  const raw = fn(guildId);
  if (Array.isArray(raw)) return { rewards: raw };
  return (raw ?? {}) as Record<string, unknown>;
}

export function updateFeatureSettings(
  guildId: string,
  feature: FeatureId,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const store = mod(FEATURE_STORE[feature]);
  const setters: Record<FeatureId, string> = {
    welcome: "updateGuild",
    autoRole: "setConfig",
    moderation: "updateGuild",
    leveling: "setReward",
    logs: "updateGuild",
  };
  const fn = store[setters[feature]] as ((...a: unknown[]) => unknown) | undefined;
  if (typeof fn !== "function") throw new Error(`Storage non scrivibile per ${feature}`);
  if (feature === "leveling") {
    for (const [level, roleId] of Object.entries(patch)) fn(guildId, Number(level), roleId);
    return getFeatureSettings(guildId, feature);
  }
  return (fn(guildId, patch) ?? getFeatureSettings(guildId, feature)) as Record<string, unknown>;
}

/** Toggle on/off feature (specchio di src/modules/registry + moduleState). */
export function setFeatureEnabled(guildId: string, featureId: string, enabled: boolean) {
  const ms = mod("moduleState");
  const fn = ms.setEnabled as ((g: string, f: string, e: boolean) => unknown) | undefined;
  if (typeof fn !== "function") throw new Error("Toggle non disponibile");
  return fn(guildId, featureId, enabled);
}

export function isFeatureEnabled(guildId: string, featureId: string): boolean {
  try {
    const ms = mod("moduleState");
    const fn = ms.isEnabled as ((g: string, f: string) => boolean) | undefined;
    return typeof fn === "function" ? fn(guildId, featureId) !== false : true;
  } catch {
    return true;
  }
}

/** Serie giornaliera per il grafico Overview (specchio di analytics.getDays). */
export function getActivityDays(guildId: string, days = 7): Array<{ date: string; messages: number; joins: number }> {
  try {
    const an = mod("analytics");
    const fn = an.getDays as ((g: string, d: number) => Array<{ date: string; messages: number; joins?: number }>) | undefined;
    if (typeof fn !== "function") return [];
    return fn(guildId, days).map((d) => ({ date: d.date, messages: d.messages ?? 0, joins: d.joins ?? 0 }));
  } catch {
    return [];
  }
}
