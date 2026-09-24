import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  SYSTEM_FEATURE_ID,
  type BlockReason,
  type GateDecision,
  type IsolatedOutcome,
} from "./types.js";

/**
 * Gate unificato: toggle persistente + circuit-breaker.
 * `isEnabled`/`isIsolated` sono iniettati: il core resta framework-free e
 * testabile senza discord.js (il bot passa registry.isEnabled/isIsolated,
 * con guardia per i moduli locked).
 */
export function checkGate(args: {
  featureId: string | null;
  guildId: string | null | undefined;
  isLocked?: (featureId: string) => boolean;
  isEnabled: (guildId: string, featureId: string) => boolean;
  isIsolated: (guildId: string | null | undefined, featureId: string) => boolean;
}): GateDecision {
  const { featureId, guildId } = args;
  if (!featureId || !guildId) return { ok: true, featureId };
  if (featureId === SYSTEM_FEATURE_ID) return { ok: true, featureId };
  try {
    if (args.isLocked?.(featureId)) return { ok: true, featureId };
  } catch {
    /* default: prosegui con i check */
  }
  let reason: BlockReason | undefined;
  try {
    if (!args.isEnabled(guildId, featureId)) reason = "disabled";
  } catch {
    /* default: consenti */
  }
  if (!reason) {
    try {
      if (args.isIsolated(guildId, featureId)) reason = "isolated";
    } catch {
      /* default: consenti */
    }
  }
  return reason ? { ok: false, reason, featureId } : { ok: true, featureId };
}

export type TimeoutResult<T> =
  | { timedOut: true }
  | { timedOut: false; value: T }
  | { timedOut: false; error: unknown };

/** Gara tra `fn()` e timeout. Non lancia mai: l'errore torna nel risultato. */
export function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<TimeoutResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (r: TimeoutResult<T>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(r);
    };
    timer = setTimeout(() => done({ timedOut: true }), ms);
    const t = timer as unknown as { unref?: () => void };
    if (typeof t.unref === "function") t.unref();
    Promise.resolve()
      .then(fn)
      .then(
        (value) => done({ timedOut: false, value }),
        (error: unknown) => done({ timedOut: false, error }),
      );
  });
}

/**
 * Esegue `fn` isolata con timeout. Registra l'errore via `onError`
 * (il chiamante decide dove: registry.recordError) e non lancia mai.
 */
export async function executeIsolated(
  fn: () => Promise<unknown>,
  opts: {
    featureId: string | null;
    timeoutMs?: number;
    onError?: (featureId: string | null, error: unknown) => void;
  },
): Promise<IsolatedOutcome> {
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_COMMAND_TIMEOUT_MS;
  const res = await withTimeout(fn, timeoutMs);
  if (res.timedOut) {
    const error = Object.assign(new Error(`timeout dopo ${timeoutMs}ms`), { code: "COMMANDER_TIMEOUT" });
    try {
      opts.onError?.(opts.featureId, error);
    } catch {
      /* tracking mai bloccante */
    }
    return { ok: false, timedOut: true, featureId: opts.featureId, error };
  }
  if ("error" in res) {
    try {
      opts.onError?.(opts.featureId, res.error);
    } catch {
      /* tracking mai bloccante */
    }
    return { ok: false, timedOut: false, featureId: opts.featureId, error: res.error };
  }
  return { ok: true, timedOut: false, featureId: opts.featureId };
}
