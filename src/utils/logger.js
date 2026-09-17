/**
 * Logger strutturato zero-dep (JSON-lines).
 *
 * - Livelli: debug / info / warn / error (soglia da env LOG_LEVEL, default "info").
 * - `logger.child(ctx)` prefixa campi a ogni record del figlio.
 * - Output: console colorata + append su `logs/YYYY-MM-DD.log`
 *   (dir creata se manca, rotazione implicita per data, errori IO ignorati: mai crashare).
 * - Niente PII oltre ID/tag: i caller devono passare solo identificatori.
 */
const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const COLORS = {
  debug: '\x1b[90m', // grigio
  info: '\x1b[36m', // ciano
  warn: '\x1b[33m', // giallo
  error: '\x1b[31m', // rosso
};
const RESET = '\x1b[0m';

function currentLevelName() {
  const raw = String(process.env.LOG_LEVEL || 'info').toLowerCase().trim();
  return LEVELS[raw] !== undefined ? raw : 'info';
}

function logDir() {
  return process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs');
}

function logFile() {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return path.join(logDir(), `${day}.log`);
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[currentLevelName()];
}

/** Appende una riga JSON sul file di giornata. Mai lanciare. */
function appendToFile(line) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(logFile(), `${line}\n`, 'utf8');
  } catch {
    // IO best-effort: il logging non deve mai crashare il bot.
  }
}

function toFields(msgOrFields, extra) {
  if (msgOrFields instanceof Error) {
    return { msg: msgOrFields.message, stack: msgOrFields.stack, ...(extra || {}) };
  }
  if (typeof msgOrFields === 'object' && msgOrFields !== null) {
    return { ...(msgOrFields || {}), ...(extra || {}) };
  }
  return { ...(extra || {}) };
}

function toMessage(msg, fields) {
  if (typeof msg === 'string') return msg;
  if (msg instanceof Error) return msg.message;
  return String(fields.msg || '');
}

function makeLogger(baseCtx = {}) {
  function log(level, msg, fields) {
    try {
      if (!shouldLog(level)) return;
      const extra = toFields(msg, fields);
      const message = toMessage(msg, extra);
      delete extra.msg;
      const record = {
        ts: new Date().toISOString(),
        level,
        msg: message,
        ...baseCtx,
        ...extra,
      };
      const line = JSON.stringify(record);
      const color = COLORS[level] || '';
      const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      try {
        consoleFn(`${color}${line}${RESET}`);
      } catch {
        // console mai fatale
      }
      appendToFile(line);
    } catch {
      // Il logging non deve mai lanciare.
    }
  }

  const api = {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
    child(ctx) {
      return makeLogger({ ...baseCtx, ...(ctx || {}) });
    },
  };
  return api;
}

const logger = makeLogger();
logger.logger = logger;

/**
 * Helper uso comandi (livello debug: silenzioso di default con LOG_LEVEL=info).
 * Solo ID, mai contenuti utente.
 */
function logCommand(guildId, userId, command, ms) {
  try {
    logger.debug('command', {
      guild: guildId || 'dm',
      user: userId || 'sconosciuto',
      command: String(command || 'sconosciuto'),
      ms: Number(ms) || 0,
    });
  } catch {
    // mai lanciare
  }
}

module.exports = logger;
module.exports.logger = logger;
module.exports.logCommand = logCommand;
module.exports.default = logger;
