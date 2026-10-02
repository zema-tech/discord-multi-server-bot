/**
 * aiProviders.js — core AI multi-provider (stile Composio: catalogo adapter + failover).
 *
 * Basta inserire UNA chiave nel .env e il bot usa quel provider:
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / GROQ_API_KEY /
 *   OPENROUTER_API_KEY / MISTRAL_API_KEY / DEEPSEEK_API_KEY / XAI_API_KEY /
 *   TOGETHER_API_KEY / CEREBRAS_API_KEY
 * Opzionali: AI_PROVIDER=auto|<nome>|custom (vedi PROVIDER_DEFS + 'custom')
 *            AI_MODEL=<modello> (default sensato per provider)
 *            AI_API_URL=<endpoint OpenAI-compatibile custom> (+ AI_API_KEY)
 *            AI_FALLBACKS="groq,openrouter" (failover in ordine: se il primo
 *              provider fallisce per rate/timeout/rete/HTTP/auth, prova i
 *              successivi; se falliscono tutti, l'errore è del primario)
 *            OLLAMA_HOST=http://mini-pc:11434 (default http://localhost:11434)
 * Senza chiavi: Pollinations gratuito (nessuna configurazione) o Ollama se
 * selezionato esplicitamente (AI_PROVIDER=ollama, nessun cloud).
 *
 * Errori lanciati hanno sempre `err.code` tra:
 *   empty|emptyResponse|auth|rate|timeout|network|http — mappati in italiano da ai/ai.js
 * (`empty` = prompt vuoto, `emptyResponse` = AI ha restituito risposta vuota).
 */

const TIMEOUT_MS = 25000;

/** Override /config sopra process.env (solo quando il chiamante usa il default). */
function withOverrides(env) {
  try {
    if (env === process.env) {
      const { effectiveEnv } = require('../database/settings');
      return effectiveEnv();
    }
  } catch {}
  return env;
}

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
  mistral: {
    label: 'Mistral', kind: 'openai', keyEnv: 'MISTRAL_API_KEY',
    url: 'https://api.mistral.ai/v1/chat/completions', defaultModel: 'mistral-small-latest',
  },
  deepseek: {
    label: 'DeepSeek', kind: 'openai', keyEnv: 'DEEPSEEK_API_KEY',
    url: 'https://api.deepseek.com/chat/completions', defaultModel: 'deepseek-chat',
  },
  xai: {
    label: 'xAI Grok', kind: 'openai', keyEnv: 'XAI_API_KEY',
    url: 'https://api.x.ai/v1/chat/completions', defaultModel: 'grok-3-mini',
  },
  together: {
    label: 'Together', kind: 'openai', keyEnv: 'TOGETHER_API_KEY',
    url: 'https://api.together.xyz/v1/chat/completions', defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  },
  cerebras: {
    label: 'Cerebras', kind: 'openai', keyEnv: 'CEREBRAS_API_KEY',
    url: 'https://api.cerebras.ai/v1/chat/completions', defaultModel: 'llama3.1-8b',
  },
  ollama: {
    label: 'Ollama (locale)', kind: 'openai', keyEnv: null,
    url: 'http://localhost:11434/v1/chat/completions', defaultModel: 'llama3.1',
  },
  fireworks: {
    label: 'Fireworks', kind: 'openai', keyEnv: 'FIREWORKS_API_KEY',
    url: 'https://api.fireworks.ai/inference/v1/chat/completions', defaultModel: 'accounts/fireworks/models/kimi-k2p6',
  },
  novita: {
    label: 'Novita', kind: 'openai', keyEnv: 'NOVITA_API_KEY',
    url: 'https://api.novita.ai/openai/v1/chat/completions', defaultModel: 'moonshotai/kimi-k2.5',
  },
  huggingface: {
    label: 'Hugging Face', kind: 'openai', keyEnv: 'HF_TOKEN',
    url: 'https://router.huggingface.co/v1/chat/completions', defaultModel: 'deepseek-ai/DeepSeek-V3.2',
  },
  nvidia: {
    label: 'NVIDIA NIM', kind: 'openai', keyEnv: 'NVIDIA_API_KEY',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions', defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
  },
  kimi: {
    label: 'Kimi/Moonshot', kind: 'openai', keyEnv: 'KIMI_API_KEY',
    url: 'https://api.moonshot.ai/v1/chat/completions', defaultModel: 'kimi-for-coding',
  },
  pollinations: { label: 'Pollinations (gratis)', kind: 'pollinations', keyEnv: null, url: 'https://text.pollinations.ai', defaultModel: '' },
};

const AUTO_ORDER = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'mistral', 'deepseek', 'xai', 'together', 'cerebras', 'fireworks', 'novita', 'huggingface', 'nvidia', 'kimi'];

/** Alias stile Hermes (--provider claude == anthropic). */
const ALIASES = { claude: 'anthropic', google: 'gemini', grok: 'xai', hf: 'huggingface' };

/** Nome canonico (risolve gli alias). */
function canon(name) {
  const n = String(name || '').toLowerCase().trim();
  return ALIASES[n] || n;
}

/** AI_MODEL senza eventuale prefisso "provider:" noto (stile Hermes). */
function cleanModel(env) {
  const model = String(env.AI_MODEL || '').trim();
  const colon = model.indexOf(':');
  if (colon > 0 && PROVIDER_DEFS[canon(model.slice(0, colon))]) {
    return model.slice(colon + 1).trim();
  }
  return model;
}

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
 * AI_MODEL accetta "provider:modello" (stile Hermes): il prefisso vince su
 * AI_PROVIDER. Prefisso sconosciuto = tutto l'ID modello (retrocompatibile).
 * @returns {{name,label,kind,url,model,key,keys}}
 */
function detectProvider(env = process.env) {
  env = withOverrides(env);
  const wanted = canon(env.AI_PROVIDER || 'auto');
  let model = String(env.AI_MODEL || '').trim();
  let forced = null;
  const colon = model.indexOf(':');
  if (colon > 0) {
    const prefix = canon(model.slice(0, colon));
    if (PROVIDER_DEFS[prefix]) {
      forced = prefix;
      model = model.slice(colon + 1).trim();
    }
  }
  const pick = forced || wanted;

  if (pick !== 'auto') {
    if (PROVIDER_DEFS[pick]) {
      const def = PROVIDER_DEFS[pick];
      const keys = poolKeys(def, env);
      return {
        name: pick, label: def.label, kind: def.kind, url: providerUrl(def, env),
        model: model || def.defaultModel, key: keys[0] || '', keys,
      };
    }
    // AI_PROVIDER=custom o valore ignoto + AI_API_URL → endpoint OpenAI-compatibile
    if (env.AI_API_URL) {
      return {
        name: 'custom', label: 'Custom (OpenAI-compatibile)', kind: 'openai',
        url: String(env.AI_API_URL).replace(/\/+$/, ''), model,
        key: String(env.AI_API_KEY || ''), keys: [String(env.AI_API_KEY || '')],
      };
    }
    throw errWith('http', `AI_PROVIDER "${wanted}" non riconosciuto.`);
  }

  for (const name of AUTO_ORDER) {
    const def = PROVIDER_DEFS[name];
    if (def.keyEnv && String(env[def.keyEnv] || '').trim()) {
      const keys = poolKeys(def, env);
      return {
        name, label: def.label, kind: def.kind, url: providerUrl(def, env),
        model: model || def.defaultModel, key: keys[0] || '', keys,
      };
    }
  }
  if (env.AI_API_URL) {
    return {
      name: 'custom', label: 'Custom (OpenAI-compatibile)', kind: 'openai',
      url: String(env.AI_API_URL).replace(/\/+$/, ''), model,
      key: String(env.AI_API_KEY || ''), keys: [String(env.AI_API_KEY || '')],
    };
  }
  const p = PROVIDER_DEFS.pollinations;
  return { name: 'pollinations', label: p.label, kind: p.kind, url: (env.AI_API_URL || p.url).replace(/\/+$/, ''), model, key: '', keys: [''] };
}

/** Stato leggibile per /ai-config mostra: { name, label, model, free, configured, fallbacks } */
function activeProvider(env = process.env) {
  try {
    const p = detectProvider(env);
    return { name: p.name, label: p.label, model: p.model || 'default', free: p.name === 'pollinations' || p.name === 'ollama', configured: true, fallbacks: fallbackNames(env, p.name) };
  } catch {
    return { name: 'none', label: 'non configurato', model: '-', free: false, configured: false, fallbacks: [] };
  }
}

/**
 * URL effettivo del provider. Precedenza: OLLAMA_HOST per Ollama,
 * <PREFIX>_BASE_URL per gli altri (es. OPENAI_BASE_URL, GROQ_BASE_URL —
 * stile Hermes), altrimenti l'URL del catalogo.
 */
function providerUrl(def, env) {
  if (def.keyEnv === null) {
    if (/ollama/i.test(def.label)) {
      const host = String(env.OLLAMA_HOST || '').trim().replace(/\/+$/, '');
      if (host) return `${host}/v1/chat/completions`;
    }
    return def.url;
  }
  const prefix = String(def.keyEnv).replace(/(_API_KEY|_TOKEN)$/, '');
  const override = String(env[`${prefix}_BASE_URL`] || '').trim().replace(/\/+$/, '');
  return override || def.url;
}

/**
 * Pool di chiavi stile Hermes (credential pools): "sk-a,sk-b" nel *_API_KEY.
 * Ritorna array (singola chiave = pool da 1). Mai vuoto.
 */
function poolKeys(def, env) {
  if (!def.keyEnv) return [''];
  const keys = String(env[def.keyEnv] || '').split(',').map((k) => k.trim()).filter(Boolean);
  return keys.length ? keys : [''];
}

/** Cursori round-robin per pool (solo quando il pool ha >1 chiave). */
const poolCursor = {};

function poolStart(name, len) {
  if (len <= 1) return 0;
  const i = Number.isFinite(poolCursor[name]) ? poolCursor[name] % len : 0;
  poolCursor[name] = (i + 1) % len;
  return i;
}

/**
 * Catena di failover da AI_FALLBACKS ("groq, openrouter"): nomi validi
 * (alias risolti), dedup, escluso il primario. Usata da resolveChain.
 */
function fallbackNames(env = process.env, primary) {
  const raw = String(env.AI_FALLBACKS || '').split(',');
  const out = [];
  for (const n of raw) {
    const name = canon(n);
    if (!name || name === primary || out.includes(name)) continue;
    if (!PROVIDER_DEFS[name]) continue;
    out.push(name);
  }
  return out;
}

/**
 * Catena completa [{...connection}] primario + fallback configurati.
 * Un fallback senza chiave richiesta viene saltato (motivo in skipped).
 * @returns {{ chain: Array, skipped: Array<{name, reason}> }}
 */
function resolveChain(env = process.env) {
  env = withOverrides(env);
  const primary = detectProvider(env);
  const model = cleanModel(env);
  const chain = [primary];
  const skipped = [];
  for (const name of fallbackNames(env, primary.name)) {
    const def = PROVIDER_DEFS[name];
    const keys = poolKeys(def, env);
    if (def.keyEnv && !keys[0]) {
      skipped.push({ name, reason: `chiave ${def.keyEnv} mancante` });
      continue;
    }
    chain.push({
      name, label: def.label, kind: def.kind, url: providerUrl(def, env),
      model: model || def.defaultModel, key: keys[0] || '', keys,
    });
  }
  return { chain, skipped };
}

/**
 * Catalogo connessioni stile Composio (per /ai-config mostra e dashboard):
 * [{ name, label, model, free, configured, keyEnv, selected }].
 */
function listProviders(env = process.env) {
  env = withOverrides(env);
  let selected = null;
  try {
    selected = detectProvider(env).name;
  } catch {}
  return Object.entries(PROVIDER_DEFS).map(([name, def]) => {
    const key = def.keyEnv ? String(env[def.keyEnv] || '').trim() : '';
    const configured = name === 'pollinations' || name === 'ollama' || !!key;
    const aliases = Object.entries(ALIASES).filter(([, c]) => c === name).map(([a]) => a);
    return {
      name, label: def.label, keyEnv: def.keyEnv, aliases,
      model: String(env.AI_MODEL || '').trim() || def.defaultModel || 'default',
      free: name === 'pollinations' || name === 'ollama',
      configured, selected: selected === name,
    };
  });
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
  const headers = { 'Content-Type': 'application/json' };
  if (provider.key) headers.Authorization = `Bearer ${provider.key}`;
  if (provider.name === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/zema-tech/zealbot-discord';
    headers['X-Title'] = 'zealbot';
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
 * Completamento unificato con failover: prova il primario poi i fallback
 * (AI_FALLBACKS) in ordine. Se falliscono tutti, l'errore è del primario
 * (niente problemi mascherati). MAI loggare prompt/risposte.
 * @param {{messages:Array<{role:string,content:string}>, system?:string, maxTokens?:number, env?:object, info?:object}} opts
 * `info` (opzionale) viene riempito con `{ provider }` che ha risposto.
 */
async function complete({ messages, system = '', maxTokens = 800, env = process.env, info = null }) {
  env = withOverrides(env);
  const { system: sys, messages: msgs } = normalizeMessages(messages, system);
  if (!msgs.length) throw errWith('empty', 'Prompt vuoto.');
  const { chain } = resolveChain(env);
  let primaryError = null;
  for (const provider of chain) {
    try {
      const text = await attemptProvider(provider, sys, msgs, maxTokens);
      if (info && typeof info === 'object') info.provider = provider.name;
      return text;
    } catch (err) {
      if (!primaryError) primaryError = err;
    }
  }
  throw primaryError || errWith('http', 'AI non disponibile, riprova più tardi.');
}

/**
 * Singolo provider con pool di chiavi: round-robin tra le chiamate, e se una
 * chiave fallisce (auth/rate/...) prova la successiva prima di cedere il
 * turno al provider dopo nella catena. Con pool da 1 = comportamento storico.
 */
async function attemptProvider(provider, sys, msgs, maxTokens) {
  const keys = Array.isArray(provider.keys) && provider.keys.length ? provider.keys : [provider.key || ''];
  const start = poolStart(provider.name, keys.length);
  let lastError = null;
  for (let k = 0; k < keys.length; k++) {
    const p = { ...provider, key: keys[(start + k) % keys.length] };
    try {
      return await attemptOnce(p, sys, msgs, maxTokens);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || errWith('http', 'AI non disponibile, riprova più tardi.');
}

/** Una chiave, con 1 retry su timeout/rete. Mappatura errori invariata. */
async function attemptOnce(provider, sys, msgs, maxTokens) {
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
  resolveChain, listProviders, fallbackNames, canon, poolKeys,
  ALIASES, PROVIDER_DEFS, TIMEOUT_MS,
};
