/**
 * ai.js — facciata AI stabile del bot (firme invariate per tutti i consumer).
 * Delega al core multi-provider (utils/aiProviders): basta una chiave nel .env.
 * Errori sempre in italiano, risposta troncata a MAX_LENGTH.
 */
const { complete, activeProvider, TIMEOUT_MS } = require('./aiProviders');
const aiUsage = require('../database/aiUsage');

const MAX_LENGTH = 1800;
const DEFAULT_DAILY_LIMIT = 500;

const IT_MESSAGES = {
  empty: 'Prompt vuoto.',
  emptyResponse: 'AI ha restituito risposta vuota, riprova.',
  auth: null, // usa messaggio del provider (include nome provider)
  rate: 'Rate limit AI raggiunto: attendi qualche secondo e riprova.',
  timeout: "L'AI non ha risposto in tempo (timeout), riprova più tardi.",
  network: 'AI irraggiungibile: controlla la connessione o riprova più tardi.',
  http: 'AI non disponibile, riprova più tardi.',
};

function toItalian(err) {
  if (err instanceof Error && /budget giornaliero esaurito/i.test(err.message || '')) return err;  if (err instanceof Error && err.message === 'Prompt vuoto.') return err;
  const code = err && err.code;
  if (code === 'auth' && err.message) return new Error(err.message);
  const msg = (code && IT_MESSAGES[code]) || IT_MESSAGES.http;
  return new Error(msg);
}

/**
 * Limite giornaliero chiamate AI (controllo costi su chiave condivisa).
 * Da env AI_DAILY_LIMIT, default 500, 0 = illimitato.
 */
function dailyLimit() {
  const raw = process.env.AI_DAILY_LIMIT;
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_DAILY_LIMIT;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_LIMIT;
  if (n <= 0) return 0;
  return n;
}

/** Lancia se il budget giornaliero è esaurito. MAI lancia per errori DB. */
function assertBudget() {
  const limit = dailyLimit();
  if (limit === 0) return;
  let count = 0;
  try {
    count = aiUsage.todayCount();
  } catch {
    return; // DB illeggibile: non rompere le chiamate esistenti
  }
  if (count >= limit) {
    throw new Error('Budget giornaliero esaurito: limite AI di oggi raggiunto, riprova domani.');
  }
}

/** Incrementa il contatore dopo un successo. MAI lancia. */
function trackUsage() {
  try {
    aiUsage.countCall();
  } catch {
    // DB non scrivibile: la risposta resta comunque valida
  }
}

/**
 * @param {string} prompt
 * @param {string} [systemPrompt]
 * @returns {Promise<string>} max 1800 caratteri
 */
async function askAI(prompt, systemPrompt = '') {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Prompt vuoto.');
  assertBudget();
  try {
    const text = await complete({
      messages: [{ role: 'user', content: cleanPrompt }],
      system: systemPrompt,
      maxTokens: 800,
    });
    const out = text.slice(0, MAX_LENGTH).trim();
    trackUsage();
    return out;
  } catch (err) {
    throw toItalian(err);
  }
}

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} [systemPrompt]
 */
async function askAIChat(messages, systemPrompt = '') {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Prompt vuoto.');
  assertBudget();
  try {
    const text = await complete({ messages, system: systemPrompt, maxTokens: 800 });
    const out = text.slice(0, MAX_LENGTH).trim();
    trackUsage();
    return out;
  } catch (err) {
    throw toItalian(err);
  }
}

/** Stato provider per /ai-config mostra: { name, label, model, free, configured } */
function aiStatus() {
  return activeProvider();
}

module.exports = { askAI, askAIChat, aiStatus, TIMEOUT_MS, MAX_LENGTH };
