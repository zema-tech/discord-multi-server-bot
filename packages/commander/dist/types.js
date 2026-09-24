"use strict";
/**
 * @repo/commander — contratto tra Commander, moduli e dashboard.
 * I moduli non parlano mai tra loro: implementano ModuleManifest e vengono
 * eseguiti solo tramite il Commander. La dashboard legge solo questi tipi.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_FEATURE_ID = exports.DEFAULT_COMMAND_TIMEOUT_MS = exports.BREAKER_WINDOW_MS = exports.BREAKER_THRESHOLD = void 0;
exports.BREAKER_THRESHOLD = 5;
exports.BREAKER_WINDOW_MS = 10 * 60 * 1000;
exports.DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
exports.SYSTEM_FEATURE_ID = "system";
//# sourceMappingURL=types.js.map