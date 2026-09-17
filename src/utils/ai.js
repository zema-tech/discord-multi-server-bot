/**
 * ai.js — facciata AI stabile del bot (firme invariate per tutti i consumer).
 * Delega al core multi-provider (utils/aiProviders): basta una chiave nel .env.
 * Errori sempre in italiano, risposta troncata a MAX_LENGTH.
 */
const { complete, activeProvider, TIMEOUT_MS } = require('./aiProviders');

const MAX_LENGTH = 1800;

const IT_MESSAGES = {
  empty: 'Prompt vuoto.',
  auth: null, // usa messaggio del provider (include nome provider)
  rate: 'Rate limit AI raggiunto: attendi qualche secondo e riprova.',
  timeout: "L'AI non ha risposto in tempo (timeout), riprova più tardi.",
  network: 'AI irraggiungibile: controlla la connessione o riprova più tardi.',
  http: 'AI non disponibile, riprova più tardi.',
};

function toItalian(err) {
  if (err instanceof Error && err.message === 'Prompt vuoto.') return err;
  const code = err && err.code;
  if (code === 'auth' && err.message) return new Error(err.message);
  const msg = (code && IT_MESSAGES[code]) || IT_MESSAGES.http;
  return new Error(msg);
}

/**
 * @param {string} prompt
 * @param {string} [systemPrompt]
 * @returns {Promise<string>} max 1800 caratteri
 */
async function askAI(prompt, systemPrompt = '') {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Prompt vuoto.');
  try {
    const text = await complete({
      messages: [{ role: 'user', content: cleanPrompt }],
      system: systemPrompt,
      maxTokens: 800,
    });
    return text.slice(0, MAX_LENGTH).trim();
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
  try {
    const text = await complete({ messages, system: systemPrompt, maxTokens: 800 });
    return text.slice(0, MAX_LENGTH).trim();
  } catch (err) {
    throw toItalian(err);
  }
}

/** Stato provider per /ai-config mostra: { name, label, model, free, configured } */
function aiStatus() {
  return activeProvider();
}

module.exports = { askAI, askAIChat, aiStatus, TIMEOUT_MS, MAX_LENGTH };
