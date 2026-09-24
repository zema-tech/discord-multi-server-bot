"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Breaker = void 0;
const types_js_1 = require("./types.js");
class Breaker {
    threshold;
    windowMs;
    entries = new Map();
    constructor(threshold = types_js_1.BREAKER_THRESHOLD, windowMs = types_js_1.BREAKER_WINDOW_MS) {
        this.threshold = threshold;
        this.windowMs = windowMs;
    }
    static key(guildId, featureId) {
        return `${guildId || "dm"}:${featureId}`;
    }
    /** Registra un errore. Ritorna true se il modulo è appena scattato in protezione. */
    note(guildId, featureId, now = Date.now()) {
        if (!featureId)
            return false;
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
    isIsolated(guildId, featureId, now = Date.now()) {
        if (!featureId)
            return false;
        const key = Breaker.key(guildId, featureId);
        const entry = this.entries.get(key);
        if (!entry?.trippedAt)
            return false;
        if (now - entry.trippedAt > this.windowMs) {
            this.entries.delete(key);
            return false;
        }
        return true;
    }
    /** Azzera il breaker (toggle on, reload, clearErrors). */
    reset(guildId, featureId) {
        if (featureId) {
            this.entries.delete(Breaker.key(guildId, featureId));
            return;
        }
        const prefix = `${guildId || "dm"}:`;
        for (const key of [...this.entries.keys()]) {
            if (key.startsWith(prefix))
                this.entries.delete(key);
        }
    }
}
exports.Breaker = Breaker;
//# sourceMappingURL=breaker.js.map