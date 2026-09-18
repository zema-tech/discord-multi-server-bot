/**
 * aiProviders.js — core AI multi-provider.
 *
 * Basta inserire UNA chiave nel .env e il bot usa quel provider:
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY /
 *   GROQ_API_KEY / OPENROUTER_API_KEY
 * Opzionali: AI_PROVIDER=auto|openai|anthropic|gemini|groq|openrouter|pollinations
 *            AI_MODEL=<modello> (default sensato per provider)
 *            AI_API_URL=<endpoint OpenAI-compatibile custom> (+ AI_API_KEY)
 * Senza chiavi: Pollinations gratuito (nessuna configurazione).
 *
 * Errori lanciati hanno sempre `err.code` tra:
 *   empty|emptyResponse|auth|rate|timeout|network|http — mappati in italiano da utils/ai.js
 * (`empty` = prompt vuoto, `emptyResponse` = AI ha restituito risposta vuota).
 */

const TIMEOUT_MS = 25000;

// Cap system prompt: Pollinations lo passa in query-string (?system=...) quindi un
// system gigante genera URL enormi (414/fetch failed). Vale per tutti i provider.
const SYSTEM_MAX_CHARS = 2000;

const PROVIDER_DEFS = {
  openai: {
    label: 'OpenAI', kind: 'openai', keyEnv: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    label: 'OpenRouter', kind: 'openai', keyEnv: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'openai/gpt-4o-mini',
  },
  groq: {
    label: 'Groq', kind: 'openai', keyEnv: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.3-70b-versatile',
  },
  anthropic: {
    label: 'Anthropic', kind: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY',
    url: 'https://api.anthropic.com/v1/messages', defaultModel: 'claude-3-5-haiku-20241022',
  },
  gemini: {
    label: 'Google Gemini', kind: 'gemini', keyEnv: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    defaultModel: 'gemini-2.0-flash',
  },
  pollinations: { label: 'Pollinations (gratis)', kind: 'pollinations', keyEnv: null, url: 'https://text.pollinations.ai', defaultModel: '' },
};

const AUTO_ORDER = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter'];

function errWith(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isTimeoutError(err) {
  return err && (err.name === 'AbortError' || (typeof err.message === 'string' && /aborted|timeout|timed out/i.test(err.message)));
}

function isNetworkError(err) {
  if (!err || isTimeoutError(err)) return false;
  const msg = String((err && err.message) || err || '');
  const code = String((err && (err.code || err.cause?.code)) || '');
  if (err instanceof TypeError) return true;
  return /fetch failed|failed to fetch|network|ECONN|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR|socket/i.test(`${msg} ${code}`);
}

/**
 * Rileva il provider da usare. `env` iniettabile per i test.
 * @returns {{name,label,kind,url,model,key}}
 */
function detectProvider(env = process.env) {
  const wanted = String(env.AI_PROVIDER || 'auto').toLowerCase().trim();
  const model = String(env.AI_MODEL || '').trim();

  if (wanted !== 'auto') {
    if (PROVIDER_DEFS[wanted]) {
      const def = PROVIDER_DEFS[wanted];
      return {
        name: wanted, label: def.label, kind: def.kind, url: def.url,
        model: model || def.defaultModel, key: def.keyEnv ? String(env[def.keyEnv] || '') : '',
      };
    }
    // AI_PROVIDER=custom o valore ignoto + AI_API_URL → endpoint OpenAI-compatibile
    if (env.AI_API_URL) {
      return {
        name: 'custom', label: 'Custom (OpenAI-compatibile)', kind: 'openai',
        url: String(env.AI_API_URL).replace(/\/+$/, ''), model,
        key: String(env.AI_API_KEY || ''),
      };
    }
    throw errWith('http', `AI_PROVIDER "${wanted}" non riconosciuto.`);
  }

  for (const name of AUTO_ORDER) {
    const def = PROVIDER_DEFS[name];
    if (def.keyEnv && String(env[def.keyEnv] || '').trim()) {
      return {
        name, label: def.label, kind: def.kind, url: def.url,
        model: model || def.defaultModel, key: String(env[def.keyEnv]).trim(),
      };
    }
  }
  if (env.AI_API_URL) {
    return {
      name: 'custom', label: 'Custom (OpenAI-compatibile)', kind: 'openai',
      url: String(env.AI_API_URL).replace(/\/+$/, ''), model,
      key: String(env.AI_API_KEY || ''),
    };
  }
  const p = PROVIDER_DEFS.pollinations;
  return { name: 'pollinations', label: p.label, kind: p.kind, url: (env.AI_API_URL || p.url).replace(/\/+$/, ''), model, key: '' };
}

/** Stato leggibile per /ai-config mostra: { name, label, model, free, configured } */
function activeProvider(env = process.env) {
  try {
    const p = detectProvider(env);
    return { name: p.name, label: p.label, model: p.model || 'default', free: p.name === 'pollinations', configured: true };
  } catch {
    return { name: 'none', label: 'non configurato', model: '-', free: false, configured: false };
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpError(res, providerName) {
  if (res.status === 401 || res.status === 403) {
    return errWith('auth', `Chiave API ${providerName} non valida o scaduta. Controlla il .env.`);
  }
  if (res.status === 429) {
    return errWith('rate', 'Rate limit AI raggiunto: attendi qualche secondo e riprova.');
  }
  if (res.status === 400) {
    return errWith('http', 'Richiesta AI rifiutata (400). Potrebbe essere il modello errato: imposta AI_MODEL.');
  }
  return errWith('http', `AI non disponibile (HTTP ${res.status}), riprova più tardi.`);
}

function normalizeMessages(messages, system) {
  const out = [];
  const sys = [String(system || '').trim()];
  for (const m of messages || []) {
    const role = String((m && m.role) || 'user').toLowerCase();
    const content = String((m && m.content) ?? '').trim();
    if (!content) continue;
    if (role === 'system') sys.push(content);
    else out.push({ role: role === 'assistant' ? 'assistant' : 'user', content });
  }
  return { system: sys.filter(Boolean).join('\n').slice(0, SYSTEM_MAX_CHARS), messages: out };
}

async function completeOpenAI(provider, system, messages, maxTokens) {
  const body = {
    model: provider.model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    max_tokens: maxTokens,
    temperature: 0.7,
  };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` };
  if (provider.name === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/zema-tech/discord-multi-server-bot';
    headers['X-Title'] = 'discord-multi-server-bot';
  }
  const res = await fetchWithTimeout(provider.url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw mapHttpError(res, provider.label);
  const data = await res.json().catch(() => ({}));
  const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  if (!String(text).trim()) throw errWith('emptyResponse', "L'AI ha restituito una risposta vuota, riprova.");
  return String(text).trim();
}

async function completeAnthropic(provider, system, messages, maxTokens) {
  const body = { model: provider.model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  const res = await fetchWithTimeout(provider.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': provider.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw mapHttpError(res, provider.label);
  const data = await res.json().catch(() => ({}));
  const text = Array.isArray(data?.content) ? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
  if (!text.trim()) throw errWith('emptyResponse', "L'AI ha restituito una risposta vuota, riprova.");
  return text.trim();
}

async function completeGemini(provider, system, messages, maxTokens) {
  const url = provider.url.replace('{model}', encodeURIComponent(provider.model || 'gemini-2.0-flash')) + `?key=${encodeURIComponent(provider.key)}`;
  const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw mapHttpError(res, provider.label);
  const data = await res.json().catch(() => ({}));
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n');
  if (!text.trim()) throw errWith('emptyResponse', "L'AI ha restituito una risposta vuota, riprova.");
  return text.trim();
}

async function completePollinations(provider, system, messages, maxTokens) {
  void maxTokens;
  const prompt = messages.map((m) => `${m.role === 'assistant' ? 'Assistente' : 'Utente'}: ${m.content}`).join('\n');
  const params = new URLSearchParams();
  if (system) params.set('system', system);
  if (provider.model) params.set('model', provider.model);
  const query = params.toString() ? `?${params.toString()}` : '';
  const url = `${provider.url}/${encodeURIComponent(prompt)}${query}`;
  const res = await fetchWithTimeout(url, provider.key ? { headers: { Authorization: `Bearer ${provider.key}` } } : {});
  if (res.status === 429) throw errWith('rate', 'Rate limit AI raggiunto: attendi qualche secondo e riprova.');
  if (!res.ok) throw errWith('http', `AI non disponibile (HTTP ${res.status}), riprova più tardi.`);
  const raw = await res.text();
  const text = extractLooseText(raw).trim();
  if (!text) throw errWith('emptyResponse', "L'AI ha restituito una risposta vuota, riprova.");
  return text;
}

function extractLooseText(raw) {
  const str = String(raw || '').trim();
  if (!str) return '';
  if (!str.startsWith('{') && !str.startsWith('[')) return str;
  try {
    const data = JSON.parse(str);
    if (typeof data === 'string') return data;
    const pick = (d) => {
      if (!d || typeof d !== 'object') return typeof d === 'string' ? d : '';
      for (const k of ['text', 'response', 'content', 'result', 'answer']) {
        if (typeof d[k] === 'string' && d[k].trim()) return d[k];
      }
      const c = d.choices && d.choices[0];
      if (c) {
        if (typeof c.text === 'string' && c.text.trim()) return c.text;
        if (c.message && typeof c.message.content === 'string' && c.message.content.trim()) return c.message.content;
      }
      return '';
    };
    if (Array.isArray(data)) {
      for (const item of data) {
        const t = pick(item);
        if (t) return t;
      }
      return '';
    }
    return pick(data);
  } catch {
    return str;
  }
}

/**
 * Completamento unificato. MAI loggare prompt/risposte.
 * @param {{messages:Array<{role:string,content:string}>, system?:string, maxTokens?:number, env?:object}} opts
 */
async function complete({ messages, system = '', maxTokens = 800, env = process.env }) {
  const { system: sys, messages: msgs } = normalizeMessages(messages, system);
  if (!msgs.length) throw errWith('empty', 'Prompt vuoto.');
  const provider = detectProvider(env);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      switch (provider.kind) {
        case 'openai': return await completeOpenAI(provider, sys, msgs, maxTokens);
        case 'anthropic': return await completeAnthropic(provider, sys, msgs, maxTokens);
        case 'gemini': return await completeGemini(provider, sys, msgs, maxTokens);
        default: return await completePollinations(provider, sys, msgs, maxTokens);
      }
    } catch (err) {
      if (err && (err.code === 'empty' || err.code === 'emptyResponse' || err.code === 'auth' || err.code === 'rate' || err.code === 'http')) throw err;
      lastError = err;
      const retryable = isTimeoutError(err) || isNetworkError(err);
      if (retryable && attempt === 1) continue;
      if (isTimeoutError(err)) throw errWith('timeout', "L'AI non ha risposto in tempo (timeout), riprova più tardi.");
      if (isNetworkError(err)) throw errWith('network', 'AI irraggiungibile: controlla la connessione o riprova più tardi.');
      throw errWith('http', 'AI non disponibile, riprova più tardi.');
    }
  }
  if (lastError) {
    if (isTimeoutError(lastError)) throw errWith('timeout', "L'AI non ha risposto in tempo (timeout), riprova più tardi.");
    throw errWith('network', 'AI irraggiungibile: controlla la connessione o riprova più tardi.');
  }
  throw errWith('http', 'AI non disponibile, riprova più tardi.');
}

module.exports = {
  complete, detectProvider, activeProvider, extractLooseText,
  PROVIDER_DEFS, TIMEOUT_MS,
};
