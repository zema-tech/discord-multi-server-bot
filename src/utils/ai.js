const DEFAULT_BASE_URL = 'https://text.pollinations.ai';
const TIMEOUT_MS = 25000;
const MAX_LENGTH = 1800;

/**
 * Interroga un endpoint AI gratuito via fetch globale (Node 24).
 * @param {string} prompt - Domanda/testo da inviare all'AI.
 * @param {string} [systemPrompt] - Istruzioni di sistema (opzionale).
 * @returns {Promise<string>} Risposta pulita (max 1800 caratteri).
 * @throws {Error} Con messaggio breve in italiano se l'AI non risponde.
 */
async function askAI(prompt, systemPrompt = '') {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    throw new Error('Prompt vuoto.');
  }

  const baseUrl = (process.env.AI_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.AI_MODEL || '';
  const apiKey = process.env.AI_API_KEY || '';
  const system = String(systemPrompt || '').trim();

  const params = new URLSearchParams();
  if (system) params.set('system', system);
  if (model) params.set('model', model);
  const query = params.toString() ? `?${params.toString()}` : '';

  const url = `${baseUrl}/${encodeURIComponent(cleanPrompt)}${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const raw = await res.text();
    const text = extractText(raw).trim();
    if (!text) {
      throw new Error('Risposta vuota.');
    }
    return text.slice(0, MAX_LENGTH).trim();
  } catch (err) {
    if (err instanceof Error && err.message === 'Prompt vuoto.') throw err;
    throw new Error('AI non disponibile, riprova più tardi.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Estrae il testo utile da una risposta che può essere testo puro
 * oppure JSON (override via AI_API_URL verso API OpenAI-compatibili).
 */
function extractText(raw) {
  const str = String(raw || '').trim();
  if (!str) return '';
  if (!str.startsWith('{') && !str.startsWith('[')) return str;
  try {
    const data = JSON.parse(str);
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      for (const item of data) {
        const t = pickText(item);
        if (t) return t;
      }
      return '';
    }
    return pickText(data);
  } catch {
    return str;
  }
}

function pickText(data) {
  if (!data || typeof data !== 'object') return typeof data === 'string' ? data : '';
  if (typeof data.text === 'string' && data.text.trim()) return data.text;
  if (typeof data.response === 'string' && data.response.trim()) return data.response;
  if (typeof data.content === 'string' && data.content.trim()) return data.content;
  if (typeof data.result === 'string' && data.result.trim()) return data.result;
  if (typeof data.answer === 'string' && data.answer.trim()) return data.answer;
  const choice = data.choices && data.choices[0];
  if (choice) {
    if (typeof choice.text === 'string' && choice.text.trim()) return choice.text;
    if (choice.message && typeof choice.message.content === 'string' && choice.message.content.trim()) {
      return choice.message.content;
    }
  }
  if (data.message && typeof data.message.content === 'string' && data.message.content.trim()) {
    return data.message.content;
  }
  return '';
}

module.exports = { askAI };
