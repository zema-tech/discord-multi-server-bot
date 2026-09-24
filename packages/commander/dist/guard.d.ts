import { type GateDecision, type IsolatedOutcome } from "./types.js";
/**
 * Gate unificato: toggle persistente + circuit-breaker.
 * `isEnabled`/`isIsolated` sono iniettati: il core resta framework-free e
 * testabile senza discord.js (il bot passa registry.isEnabled/isIsolated,
 * con guardia per i moduli locked).
 */
export declare function checkGate(args: {
    featureId: string | null;
    guildId: string | null | undefined;
    isLocked?: (featureId: string) => boolean;
    isEnabled: (guildId: string, featureId: string) => boolean;
    isIsolated: (guildId: string | null | undefined, featureId: string) => boolean;
}): GateDecision;
export type TimeoutResult<T> = {
    timedOut: true;
} | {
    timedOut: false;
    value: T;
} | {
    timedOut: false;
    error: unknown;
};
/** Gara tra `fn()` e timeout. Non lancia mai: l'errore torna nel risultato. */
export declare function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<TimeoutResult<T>>;
/**
 * Esegue `fn` isolata con timeout. Registra l'errore via `onError`
 * (il chiamante decide dove: registry.recordError) e non lancia mai.
 */
export declare function executeIsolated(fn: () => Promise<unknown>, opts: {
    featureId: string | null;
    timeoutMs?: number;
    onError?: (featureId: string | null, error: unknown) => void;
}): Promise<IsolatedOutcome>;
//# sourceMappingURL=guard.d.ts.map