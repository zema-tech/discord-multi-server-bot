"use strict";
/**
 * Guardian — sistema immunitario del Commander (compilato da src/guardian.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardian = exports.Guardian = void 0;
const WINDOW_MS = 5 * 60 * 1000;
const FAIL_PENALTY = 15;
const TIMEOUT_PENALTY = 25;
const OK_RECOVERY = 4;
const QUARANTINE_SCORE = 30;
const FAIL_BURST = 3;
function levelOf(score) {
    if (score >= 70)
        return "ok";
    if (score >= 40)
        return "weak";
    return "critical";
}
function key(guildId, featureId) {
    return `${guildId || "dm"}:${featureId}`;
}
class Guardian {
    constructor() {
        this.states = new Map();
    }
    observe(input, now = Date.now()) {
        const featureId = input.featureId ? String(input.featureId) : "";
        if (!featureId)
            return null;
        const k = key(input.guildId, featureId);
        let st = this.states.get(k);
        if (!st) {
            st = { score: 100, fails: 0, oks: 0, recentFails: [], lastAt: 0, lastError: null };
            this.states.set(k, st);
        }
        st.recentFails = st.recentFails.filter((t) => now - t <= WINDOW_MS);
        if (input.ok) {
            st.oks += 1;
            st.score = Math.min(100, st.score + OK_RECOVERY);
            st.lastError = null;
        }
        else {
            st.fails += 1;
            st.recentFails.push(now);
            const penalty = input.timedOut ? TIMEOUT_PENALTY : FAIL_PENALTY;
            st.score = Math.max(0, st.score - penalty);
            st.lastError = (input.errMessage || "error").slice(0, 200);
        }
        st.lastAt = now;
        return this.toHealth(featureId, st);
    }
    score(guildId, featureId) {
        const st = this.states.get(key(guildId, featureId));
        return st ? st.score : 100;
    }
    health(guildId, featureId) {
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
    summary(guildId) {
        const gid = guildId || "dm";
        const prefix = `${gid}:`;
        const features = [];
        for (const [k, st] of this.states) {
            if (!k.startsWith(prefix))
                continue;
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
    reset(guildId, featureId) {
        if (featureId) {
            this.states.delete(key(guildId, featureId));
            return;
        }
        const prefix = `${guildId || "dm"}:`;
        for (const k of [...this.states.keys()]) {
            if (k.startsWith(prefix))
                this.states.delete(k);
        }
    }
    toHealth(featureId, st) {
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
exports.Guardian = Guardian;
exports.guardian = new Guardian();
