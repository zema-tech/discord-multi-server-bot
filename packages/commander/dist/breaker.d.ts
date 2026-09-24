export declare class Breaker {
    private readonly threshold;
    private readonly windowMs;
    private readonly entries;
    constructor(threshold?: number, windowMs?: number);
    static key(guildId: string | null | undefined, featureId: string): string;
    /** Registra un errore. Ritorna true se il modulo è appena scattato in protezione. */
    note(guildId: string | null | undefined, featureId: string, now?: number): boolean;
    /** True se il modulo è in protezione. Auto-reset oltre la finestra. */
    isIsolated(guildId: string | null | undefined, featureId: string, now?: number): boolean;
    /** Azzera il breaker (toggle on, reload, clearErrors). */
    reset(guildId: string | null | undefined, featureId?: string): void;
}
//# sourceMappingURL=breaker.d.ts.map