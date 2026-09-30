/**
 * Guardian — sistema immunitario del Commander (cervello).
 * Non è un LLM: regole + punteggi deterministici (~mini-IA).
 * Osserva gli esiti dei muscoli (moduli/dashboard/MCP), aggiorna uno score
 * per guild:feature e espone summary per la dashboard.
 * La quarantena resta sul Breaker/registry: il Guardian valuta e consiglia.
 */

export type GuardianSource = "command" | "event" | "dashboard" | "mcp" | "other";

export type GuardianLevel = "ok" | "weak" | "critical";

export interface GuardianObserveInput {
  guildId: string | null | undefined;
  featureId: string | null | undefined;
  ok: boolean;
  ms?: number;
  timedOut?: boolean;
  source?: GuardianSource;
  errMessage?: string;
}

export interface GuardianFeatureHealth {
  featureId: string;
  score: number;
  level: GuardianLevel;
  fails: number;
  oks: number;
  lastAt: string | null;
  lastError: string | null;
  recommendQuarantine: boolean;
}

export interface GuardianGuildSummary {
  guildId: string;
  features: GuardianFeatureHealth[];
  critical: number;
  weak: number;
  ok: number;
}

interface FeatureState {
  score: number;
  fails: number;
  oks: number;
  recentFails: number[];
  lastAt: number;
  lastError: string | null;
}

const WINDOW_MS = 5 * 60 * 1000;
const FAIL_PENALTY = 15;
const TIMEOUT_PENALTY = 25;
const OK_RECOVERY = 4;
const QUARANTINE_SCORE = 30;
const FAIL_BURST = 3;

function levelOf(score: number): GuardianLevel {
  if (score >= 70) return "ok";
  if (score >= 40) return "weak";
  return "critical";
}

function key(guildId: string | null | undefined, featureId: string): string {
  return `${guildId || "dm"}:${featureId}`;
}

export class Guardian {
  private readonly states = new Map<string, FeatureState>();

  observe(input: GuardianObserveInput, now = Date.now()): GuardianFeatureHealth | null {
    const featureId = input.featureId ? String(input.featureId) : "";
    if (!featureId) return null;

    const k = key(input.guildId, featureId);
    let st = this.states.get(k);
    if (!st) {
      st = { score: 100, fails: 0, oks: 0, recentFails: [], lastAt: 0, lastError: null };
      this.states.set(k, st);
    }

    // scarta fail fuori finestra
    st.recentFails = st.recentFails.filter((t) => now - t <= WINDOW_MS);

    if (input.ok) {
      st.oks += 1;
      st.score = Math.min(100, st.score + OK_RECOVERY);
      st.lastError = null;
    } else {
      st.fails += 1;
      st.recentFails.push(now);
      const penalty = input.timedOut ? TIMEOUT_PENALTY : FAIL_PENALTY;
      st.score = Math.max(0, st.score - penalty);
      st.lastError = (input.errMessage || "error").slice(0, 200);
    }
    st.lastAt = now;

    return this.toHealth(featureId, st);
  }

  score(guildId: string | null | undefined, featureId: string): number {
    const st = this.states.get(key(guildId, featureId));
    return st ? st.score : 100;
  }

  health(guildId: string | null | undefined, featureId: string): GuardianFeatureHealth {
    const st = this.states.get(key(guildId, featureId));
    if (!st) {
      return {
        featureId,
        score: 100,
        level: "ok",
        fails: 0,
        oks: 0,
        lastAt: null,
        lastError: null,
        recommendQuarantine: false,
      };
    }
    return this.toHealth(featureId, st);
  }

  /** Riepilogo per una guild (dashboard Diagnostica / panoramica). */
  summary(guildId: string | null | undefined): GuardianGuildSummary {
    const gid = guildId || "dm";
    const prefix = `${gid}:`;
    const features: GuardianFeatureHealth[] = [];
    for (const [k, st] of this.states) {
      if (!k.startsWith(prefix)) continue;
      const featureId = k.slice(prefix.length);
      features.push(this.toHealth(featureId, st));
    }
    features.sort((a, b) => a.score - b.score);
    return {
      guildId: gid,
      features,
      critical: features.filter((f) => f.level === "critical").length,
      weak: features.filter((f) => f.level === "weak").length,
      ok: features.filter((f) => f.level === "ok").length,
    };
  }

  /** Azzera stato (dopo reload/reset modulo). */
  reset(guildId: string | null | undefined, featureId?: string): void {
    if (featureId) {
      this.states.delete(key(guildId, featureId));
      return;
    }
    const prefix = `${guildId || "dm"}:`;
    for (const k of [...this.states.keys()]) {
      if (k.startsWith(prefix)) this.states.delete(k);
    }
  }

  private toHealth(featureId: string, st: FeatureState): GuardianFeatureHealth {
    const burst = st.recentFails.length >= FAIL_BURST;
    const recommendQuarantine = st.score < QUARANTINE_SCORE || burst;
    return {
      featureId,
      score: st.score,
      level: levelOf(st.score),
      fails: st.fails,
      oks: st.oks,
      lastAt: st.lastAt ? new Date(st.lastAt).toISOString() : null,
      lastError: st.lastError,
      recommendQuarantine,
    };
  }
}

/** Singleton di processo: un solo sistema immunitario nel cervello. */
export const guardian = new Guardian();
