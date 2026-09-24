export { Breaker } from "./breaker.js";
export { checkGate, executeIsolated, withTimeout, type TimeoutResult } from "./guard.js";
export {
  BREAKER_THRESHOLD,
  BREAKER_WINDOW_MS,
  DEFAULT_COMMAND_TIMEOUT_MS,
  SYSTEM_FEATURE_ID,
  type BlockReason,
  type GateDecision,
  type IsolatedOutcome,
  type ModuleErrorInfo,
  type ModuleHealth,
  type ModuleManifest,
} from "./types.js";
