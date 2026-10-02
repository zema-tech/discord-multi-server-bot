'use strict';
/**
 * src/agents/router.js — JARVIS: orchestratore che smista agli specialisti.
 *
 * Flusso: /jarvis compito → classify() → handoff allo specialista →
 * loop ReAct (max N passi: AZIONE tool / RISPOSTA finale) in sandbox →
 * risultato + sessione visibile nei goggles.
 * Senza chiave AI: scheda di capacità deterministica (niente fumo).
 */

const manifest = require('./manifest');
const sessions = require('./sessions');
const sandbox = require('./sandbox');
const { catalog } = require('./tools');

function maxSteps() {
  const n = Number.parseInt(String(process.env.JARVIS_MAX_STEPS || ''), 10);
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 8);
  return 3;
}

/** Routing deterministico a parole chiave (funziona anche senza AI). */
function classify(task) {
  const t = String(task || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  const scores = {};
  for (const a of manifest.AGENTS) {
    if (a.role !== 'specialist') continue;
    let score = 0;
    for (const kw of a.keywords) {
      if (kw && t.includes(kw)) score += kw.length >= 6 ? 2 : 1;
    }
    scores[a.id] = score;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  if (!best || bestScore === 0) {
    return { agentId: 'jarvis', confidence: 0.4, scores, reason: 'nessuno specialista adatto: risponde JARVIS' };
  }
  return { agentId: best.id, confidence: Math.min(0.95, 0.55 + bestScore * 0.1), scores, reason: `parole chiave → ${best.name}` };
}

function askAI() {
  return require('../ai/ai').askAI;
}

function reactSystem(agent) {
  return (
    `${agent.prompt}\n\n` +
    'Lavori a passi. Strumenti disponibili:\n' +
    catalog().map((c) => `- ${c}`).join('\n') +
    '\n\nAd ogni turno rispondi in UNO di questi due formati (solo quello, niente altro dopo):\n' +
    'AZIONE: nomeStrumento {"argomento": "valore", ...}\n' +
    'oppure\n' +
    'RISPOSTA: testo finale per l\u2019utente\n\n' +
    'Argomenti per posizione: say(testo) note(testo) fetchUrl(url) ' +
    'useService(servizio, account, {url, method, body}) askOwner(domanda). ' +
    'Esempio: AZIONE: fetchUrl {"url": "https://example.com"}. ' +
    'Sii parsimonioso: max qualche azione, poi RISPOSTA.'
  );
}

function parseAct(text) {
  const t = String(text || '');
  const idxA = t.lastIndexOf('AZIONE:');
  const idxR = t.lastIndexOf('RISPOSTA:');
  if (idxR >= 0 && idxR > idxA) return { kind: 'answer', text: t.slice(idxR + 'RISPOSTA:'.length).trim() };
  if (idxA >= 0) {
    const rest = t.slice(idxA + 'AZIONE:'.length).trim();
    const m = rest.match(/^([a-zA-Z]+)\s*(\{[\s\S]*\})?\s*$/);
    if (!m) return { kind: 'answer', text: t.trim() };
    let args = {};
    if (m[2]) {
      try {
        args = JSON.parse(m[2]);
      } catch {
        return { kind: 'answer', text: t.trim() };
      }
    }
    return { kind: 'action', tool: m[1], args };
  }
  return { kind: 'answer', text: t.trim() };
}

const TOOL_ARITY = { say: ['testo'], note: ['testo'], fetchUrl: ['url'], useService: ['servizio', 'account', 'req'], askOwner: ['domanda'] };

function mapArgs(tool, args) {
  const obj = args && typeof args === 'object' ? args : {};
  const pick = (...keys) => {
    for (const k of keys) if (obj[k] !== undefined) return obj[k];
    const vals = Object.values(obj);
    return vals.length ? vals[0] : undefined;
  };
  switch (tool) {
    case 'say':
      return [pick('testo', 'text', '0')];
    case 'note':
      return [pick('testo', 'text', '0')];
    case 'fetchUrl':
      return [pick('url', '0')];
    case 'useService':
      return [pick('servizio', 'service', '0'), pick('account', '0', '1') || 'default', pick('req', 'request', '2') || {}];
    case 'askOwner':
      return [pick('domanda', 'question', '0')];
    default:
      return [];
  }
}

/** Loop ReAct dello specialista dentro la sandbox. */
async function runSpecialist(agent, task, ctx) {
  const { tools, signal } = ctx;
  const history = [];
  const sys = reactSystem(agent);
  let lastAnswer = '';

  for (let i = 0; i < maxSteps(); i++) {
    if (signal && signal.aborted) throw new Error('Tempo scaduto.');
    // Take-over del proprietario: entra come osservazione prioritaria.
    try {
      const notes = sessions.drainInbox(ctx.sessionId);
      for (const n of notes) {
        history.push(`ISTRUZIONE DEL PROPRIETARIO (prioritaria): ${n.text}`);
        sessions.step(ctx.sessionId, 'note', `🎧 Take-over: ${n.text.slice(0, 300)}`);
      }
    } catch {}

    const prompt =
      `Compito: ${task}\n\n` +
      (history.length ? `Finora:\n${history.slice(-6).join('\n')}\n\n` : '') +
      'Prossimo passo (AZIONE … oppure RISPOSTA …):';
    let out;
    try {
      sessions.step(ctx.sessionId, 'thought', `🤔 ${agent.name}: passo ${i + 1}/${maxSteps()}`);
      out = await askAI()(prompt, sys);
    } catch (err) {
      throw err; // il chiamante decide il fallback
    }
    const act = parseAct(out);
    if (act.kind === 'answer') {
      lastAnswer = act.text;
      sessions.step(ctx.sessionId, 'thought', `✅ ${agent.name}: risposta pronta`);
      return lastAnswer;
    }
    if (typeof tools[act.tool] !== 'function') {
      history.push(`OSSERVAZIONE: strumento "${act.tool}" non disponibile in sandbox. Usa solo: ${Object.keys(tools).join(', ')}.`);
      sessions.step(ctx.sessionId, 'observation', `⚠️ tool sconosciuto: ${act.tool}`);
      continue;
    }
    sessions.step(ctx.sessionId, 'action', `🔧 ${act.tool}(${JSON.stringify(act.args).slice(0, 200)})`);
    try {
      const res = await tools[act.tool](...mapArgs(act.tool, act.args));
      history.push(`OSSERVAZIONE (${act.tool}): ${String(res).slice(0, 1500)}`);
      sessions.step(ctx.sessionId, 'observation', `📥 ${act.tool}: ${String(res).slice(0, 300)}`);
    } catch (err) {
      const msg = String((err && err.message) || err).slice(0, 500);
      history.push(`OSSERVAZIONE (${act.tool}): ERRORE: ${msg}`);
      sessions.step(ctx.sessionId, 'observation', `❌ ${act.tool}: ${msg.slice(0, 300)}`);
    }
  }
  return lastAnswer || 'Ho esaurito i passi senza una risposta completa: riformula il compito in modo più specifico.';
}

function capabilityCard(route, task) {
  const names = manifest.list().map((a) => `${a.icon} **${a.name}** — ${a.tagline}`).join('\n');
  return (
    `Modalità senza AI (nessun provider configurato).\n` +
    `Ho comunque analizzato il compito: lo affiderei a **${route.agentId}** (${route.reason}).\n\n` +
    `Agenti disponibili:\n${names}\n\n` +
    `Configura una chiave AI (anche gratis, vedi .env.example) per il ragionamento completo.`
  );
}

/**
 * Esegue un compito: routing + handoff + sandbox + sessione.
 * @param {string} task
 * @param {object} opts { guildId, userId, userName, agentId?, onApproval, onProgress }
 */
async function run(task, opts = {}) {
  const clean = String(task || '').trim();
  if (!clean) throw new Error('Compito vuoto.');
  const forced = opts.agentId ? manifest.get(opts.agentId) : null;
  const route = forced
    ? { agentId: forced.id, confidence: 1, scores: {}, reason: 'scelto dal proprietario' }
    : classify(clean);
  const agent = manifest.get(route.agentId) || manifest.get('jarvis');

  const session = sessions.start(agent.id, clean, {
    guildId: opts.guildId || null,
    userId: opts.userId || null,
    userName: opts.userName || null,
  });
  sessions.step(session.id, 'handoff', `⚡ JARVIS → ${agent.icon} ${agent.name} (${route.reason}, confidenza ${Math.round(route.confidence * 100)}%)`);
  try {
    if (typeof opts.onProgress === 'function') await opts.onProgress(session);
  } catch {}

  const outcome = await sandbox.runAgent(
    agent,
    async (ctx) => {
      if (agent.role === 'orchestrator') {
        // JARVIS diretto: risposta singola con contesto.
        try {
          const notes = sessions.drainInbox(ctx.sessionId).map((n) => n.text).join(' | ');
          const out = await askAI()(
            `Compito: ${clean}${notes ? `\nIstruzioni proprietario: ${notes}` : ''}`,
            reactSystem(agent)
          );
          const act = parseAct(out);
          return act.kind === 'answer' ? act.text : out;
        } catch (err) {
          return capabilityCard(route, clean);
        }
      }
      try {
        return await runSpecialist(agent, clean, ctx);
      } catch (err) {
        // AI non disponibile o errore: fallback onesto, mai fumo.
        sessions.step(ctx.sessionId, 'observation', `⚠️ fallback senza AI: ${String((err && err.message) || err).slice(0, 200)}`);
        return capabilityCard(route, clean);
      }
    },
    { sessionId: session.id, onApproval: opts.onApproval }
  );

  if (!outcome.ok) {
    const msg = outcome.timedOut ? 'Tempo scaduto: il compito era troppo lungo, riprova dividendolo.' : `Errore: ${outcome.error || 'sconosciuto'}`;
    sessions.end(session.id, msg, outcome.timedOut ? 'timeout' : 'error');
    return { ok: false, sessionId: session.id, agentId: agent.id, agentName: agent.name, error: msg, route };
  }
  const result = String(outcome.result || '').slice(0, 3500) || '(nessun risultato)';
  sessions.step(session.id, 'result', result.slice(0, 1000));
  sessions.end(session.id, result, 'done');
  return { ok: true, sessionId: session.id, agentId: agent.id, agentName: agent.name, icon: agent.icon, result, route };
}

module.exports = { classify, run, maxSteps };
