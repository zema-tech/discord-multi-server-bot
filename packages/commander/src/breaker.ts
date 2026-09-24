import { BREAKER_THRESHOLD, BREAKER_WINDOW_MS } from "./types.js";

/**
 * Circuit-breaker per feature+guild: dopo `threshold` errori in `windowMs`,
 * il modulo va in protezione (isolato) finché la finestra non scade o
 * qualcuno non chiama reset(). Usato dal bot (registry) e leggibile
 * dalla dashboard via health().
 */
interface BreakerEntry {
  count: number;
  firstAt: number;
  trippedAt: number | null;
}

export class Breaker {
  private readonly entries = new Map<string, BreakerEntry>();

  constructor(
    private readonly threshold: number = BREAKER_THRESHOLD,
    private readonly windowMs: number = BREAKER_WINDOW_MS,
  ) {}

  static key(guildId: string | null | undefined, featureId: string): string {
    return `${guildId || "dm"}:${featureId}`;
  }

  /** Registra un errore. Ritorna true se il modulo è appena scattato in protezione. */
  note(guildId: string | null | undefined, featureId: string, now = Date.now()): boolean {
    if (!featureId) return false;
    const key = Breaker.key(guildId, featureId);
    const prev = this.entries.get(key);
    let count = 1;
    let firstAt = now;
    if (prev && Number.isFinite(prev.count) && Number.isFinite(prev.firstAt) && now - prev.firstAt <= this.windowMs) {
      count = prev.count + 1;
      firstAt = prev.firstAt;
    }
    const tripped = count >= this.threshold;
    this.entries.set(key, {
      count,
      firstAt,
      trippedAt: tripped ? (prev?.trippedAt ?? now) : (prev?.trippedAt ?? null),
    });
    return tripped;
  }

  /** True se il modulo è in protezione. Auto-reset oltre la finestra. */
  isIsolated(guildId: string | null | undefined, featureId: string, now = Date.now()): boolean {
    if (!featureId) return false;
    const key = Breaker.key(guildId, featureId);
    const entry = this.entries.get(key);
    if (!entry?.trippedAt) return false;
    if (now - entry.trippedAt > this.windowMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /** Azzera il breaker (toggle on, reload, clearErrors). */
  reset(guildId: string | null | undefined, featureId?: string): void {
    if (featureId) {
      this.entries.delete(Breaker.key(guildId, featureId));
      return;
    }
    const prefix = `${guildId || "dm"}:`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}
