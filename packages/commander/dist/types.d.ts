/**
 * @repo/commander — contratto tra Commander, moduli e dashboard.
 * I moduli non parlano mai tra loro: implementano ModuleManifest e vengono
 * eseguiti solo tramite il Commander. La dashboard legge solo questi tipi.
 */
export type BlockReason = "disabled" | "isolated";
export interface GateDecision {
    ok: boolean;
    reason?: BlockReason;
    featureId: string | null;
}
/** Descrittore di un modulo (specchio di src/modules/<id>.js). */
export interface ModuleManifest {
    id: string;
    title: string;
    icon: string;
    section: string;
    description: string;
    commands: string[];
    events: string[];
    handlers: string[];
    locked: boolean;
}
export interface ModuleErrorInfo {
    feature: string;
    message: string;
    at: string;
    count: number;
}
export interface ModuleHealth {
    id: string;
    title: string;
    icon: string;
    section: string;
    description: string;
    enabled: boolean;
    locked: boolean;
    commands: number;
    ok: boolean;
    isolated: boolean;
    errors: ModuleErrorInfo[];
    stats: Record<string, number | string | boolean>;
}
/** Esito di un'esecuzione isolata (comando o evento). */
export interface IsolatedOutcome {
    ok: boolean;
    timedOut: boolean;
    featureId: string | null;
    skipped?: boolean;
    reason?: BlockReason;
    error?: unknown;
}
export declare const BREAKER_THRESHOLD = 5;
export declare const BREAKER_WINDOW_MS: number;
export declare const DEFAULT_COMMAND_TIMEOUT_MS = 15000;
export declare const SYSTEM_FEATURE_ID = "system";
//# sourceMappingURL=types.d.ts.map