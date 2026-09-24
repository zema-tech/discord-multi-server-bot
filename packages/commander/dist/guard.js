"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPONENT_EXACT = exports.COMPONENT_PREFIXES = void 0;
exports.checkGate = checkGate;
exports.withTimeout = withTimeout;
exports.executeIsolated = executeIsolated;
exports.resolveComponentFeature = resolveComponentFeature;
const types_js_1 = require("./types.js");
/**
 * Gate unificato: toggle persistente + circuit-breaker.
 * `isEnabled`/`isIsolated` sono iniettati: il core resta framework-free e
 * testabile senza discord.js (il bot passa registry.isEnabled/isIsolated,
 * con guardia per i moduli locked).
 */
function checkGate(args) {
    const { featureId, guildId } = args;
    if (!featureId || !guildId)
        return { ok: true, featureId };
    if (featureId === types_js_1.SYSTEM_FEATURE_ID)
        return { ok: true, featureId };
    try {
        if (args.isLocked?.(featureId))
            return { ok: true, featureId };
    }
    catch {
        /* default: prosegui con i check */
    }
    let reason;
    try {
        if (!args.isEnabled(guildId, featureId))
            reason = "disabled";
    }
    catch {
        /* default: consenti */
    }
    if (!reason) {
        try {
            if (args.isIsolated(guildId, featureId))
                reason = "isolated";
        }
        catch {
            /* default: consenti */
        }
    }
    return reason ? { ok: false, reason, featureId } : { ok: true, featureId };
}
/** Gara tra `fn()` e timeout. Non lancia mai: l'errore torna nel risultato. */
function withTimeout(fn, ms) {
    return new Promise((resolve) => {
        let settled = false;
        let timer;
        const done = (r) => {
            if (settled)
                return;
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            resolve(r);
        };
        timer = setTimeout(() => done({ timedOut: true }), ms);
        const t = timer;
        if (typeof t.unref === "function")
            t.unref();
        Promise.resolve()
            .then(fn)
            .then((value) => done({ timedOut: false, value }), (error) => done({ timedOut: false, error }));
    });
}
/**
 * Esegue `fn` isolata con timeout. Registra l'errore via `onError`
 * (il chiamante decide dove: registry.recordError) e non lancia mai.
 */
async function executeIsolated(fn, opts) {
    const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : types_js_1.DEFAULT_COMMAND_TIMEOUT_MS;
    const res = await withTimeout(fn, timeoutMs);
    if (res.timedOut) {
        const error = Object.assign(new Error(`timeout dopo ${timeoutMs}ms`), { code: "COMMANDER_TIMEOUT" });
        try {
            opts.onError?.(opts.featureId, error);
        }
        catch {
            /* tracking mai bloccante */
        }
        return { ok: false, timedOut: true, featureId: opts.featureId, error };
    }
    if ("error" in res) {
        try {
            opts.onError?.(opts.featureId, res.error);
        }
        catch {
            /* tracking mai bloccante */
        }
        return { ok: false, timedOut: false, featureId: opts.featureId, error: res.error };
    }
    return { ok: true, timedOut: false, featureId: opts.featureId };
}
/**
 * customId (bottoni/select/modal) -> feature. Strategia:
 * 1. match esatto (modali embed builder),
 * 2. testa prima dei ':' -> nome comando (bottoni dinamici `trivia:uid:...`),
 * 3. prefissi statici (`ticket_`, `rr_`, `nuke_`, `wizard_`, `embed_`).
 * Sconosciuto -> null (fail-open: i collettori effimeri vivono già sotto gate).
 */
exports.COMPONENT_PREFIXES = [
    ["ticketai_", "tickets"],
    ["ticket_", "tickets"],
    ["rr_", "reactionRoles"],
    ["nuke_", "moderation"],
    ["wizard_", "utility"],
    ["embed_", "utility"],
];
exports.COMPONENT_EXACT = {
    embed_builder: "utility",
    titolo: "utility",
    descrizione: "utility",
    colore: "utility",
    footer: "utility",
    immagine: "utility",
};
function resolveComponentFeature(customId, commandFeature) {
    if (typeof customId !== "string" || !customId)
        return null;
    const head = customId.split(":")[0];
    if (Object.prototype.hasOwnProperty.call(exports.COMPONENT_EXACT, head)) {
        return exports.COMPONENT_EXACT[head];
    }
    try {
        const fromCommand = commandFeature(head);
        if (fromCommand)
            return fromCommand;
    }
    catch {
        /* fail-open sotto */
    }
    const candidates = head !== customId ? [head, customId] : [customId];
    for (const c of candidates) {
        for (const [prefix, featureId] of exports.COMPONENT_PREFIXES) {
            if (c.startsWith(prefix))
                return featureId;
        }
    }
    return null;
}
//# sourceMappingURL=guard.js.map