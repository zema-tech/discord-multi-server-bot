# Configurazione (variabili d'ambiente)

Tutte le env lette dal codice (`grep process.env` in `src/`,
`deploy-commands.js`) più `.env.example`. Copia `.env.example` in `.env`
e compila almeno le obbligatorie. Mai committare `.env`.

La configurazione per-server (lingua, canali, welcome, automod, ticket, livelli, AI, permessi) avviene esclusivamente dalla dashboard web (`<BASE_URL>/app.html`, sezioni Generale, Moderazione, Livelli, Ticket e Vocali, AI ed Extra, Permessi). Questo file descrive solo le variabili d'ambiente del processo.

| Variabile | Obbligatoria | Default | Dove usata | Note |
|---|---|---|---|---|
| `DISCORD_TOKEN` | sì | — | `src/index.js`, `deploy-commands.js` | Token del bot. Senza, il bot esce con errore. |
| `CLIENT_ID` | sì (per deploy comandi e dashboard) | — | `deploy-commands.js`, `src/dashboard/auth.js` | Application ID. `deploy-commands.js` lo usa senza fallback. |
| `GUILD_ID` | no | — (deploy globale) | `deploy-commands.js` | Se impostato, registra i comandi solo sul server di test (veloce); altrimenti globale (fino a ~1h). |
| `AI_PROVIDER` | no | `auto` | `src/utils/aiProviders.js` | `auto` sceglie da solo tra le chiavi presenti; valori: `openai`, `anthropic`, `gemini`, `groq`, `openrouter`, `pollinations`; valore ignoto + `AI_API_URL` = endpoint OpenAI-compatibile custom. |
| `OPENAI_API_KEY` | no (ne basta una) | — | `src/utils/aiProviders.js` | Modello default `gpt-4o-mini`. |
| `ANTHROPIC_API_KEY` | no (ne basta una) | — | `src/utils/aiProviders.js` | Modello default `claude-3-5-haiku-20241022`. |
| `GEMINI_API_KEY` | no (ne basta una) | — | `src/utils/aiProviders.js` | Modello default `gemini-2.0-flash`. |
| `GROQ_API_KEY` | no (ne basta una) | — | `src/utils/aiProviders.js` | Modello default `llama-3.3-70b-versatile`. |
| `OPENROUTER_API_KEY` | no (ne basta una) | — | `src/utils/aiProviders.js` | Modello default `openai/gpt-4o-mini`. |
| `AI_MODEL` | no | modello default del provider | `src/utils/aiProviders.js` | Override del modello (utile anche con `AI_API_URL` custom). |
| `AI_API_URL` | no | `https://text.pollinations.ai` | `src/utils/aiProviders.js` | Endpoint OpenAI-compatibile custom; senza chiavi si usa Pollinations gratis, nessuna chiave richiesta. |
| `AI_API_KEY` | no | — | `src/utils/aiProviders.js` | Chiave per `AI_API_URL` custom. |
| `AI_DAILY_LIMIT` | no | `500` | `src/utils/ai.js` | Budget giornaliero chiamate AI su chiave condivisa (`0` = illimitato). Oltre il limite l'AI risponde "Budget giornaliero esaurito". |
| `DB_BACKEND` | no | `json` | `src/database/store.js` | `json` (file `src/database/*.json`) o `sqlite` (tabella `kv` via `node:sqlite`, Node 22+). Valori diversi da `sqlite` ricadono su `json`. |
| `DB_SQLITE_PATH` | no | `./data/bot.db` | `src/database/store.js`, `src/jobs/backup.js` | Path del database sqlite (directory creata se manca, `journal_mode=WAL`). Incluso nel backup se il file esiste. Se `node:sqlite` manca: fallback a json con warning. |
| `LOG_LEVEL` | no | `info` | `src/utils/logger.js` | `debug`, `info`, `warn`, `error`. Log JSON-lines su console + `logs/YYYY-MM-DD.log`. |
| `LOG_DIR` | no | `logs` | `src/utils/logger.js` | Directory dei file di log giornalieri. |
| `BACKUP_DIR` | no | `backups` | `src/jobs/backup.js` | Destinazione backup notturni `YYYY-MM-DD-HHmm/`, retention 7 giorni, journal `last.json`. Non presente in `.env.example` (trovata via grep). |
| `SELF_IMPROVE` | no | off | `src/jobs/selfImprove.js` | Solo `=1` attiva il self-improvement notturno. Mai commit automatici: revisiona con `git diff`. |
| `SELF_IMPROVE_TIME` | no | `22:00` | `src/jobs/selfImprove.js` | Ora locale di esecuzione. |
| `SELF_IMPROVE_DRY_RUN` | no | off | `src/jobs/selfImprove.js` | `=1`: solo report, nessuna patch applicata. |
| `SELF_IMPROVE_GUILD_ID` | no | — (solo log) | `src/jobs/selfImprove.js` | Server dove inviare il report notturno. |
| `DASHBOARD_PORT` | no | — (dashboard spenta) | `src/index.js`, `src/dashboard/server.js` | Se impostato avvia Express nello stesso processo (`\|\| 3000` se stringa non numerica). |
| `SESSION_SECRET` | sì (se dashboard) | — | `src/dashboard/auth.js` | Segreto sessione, almeno 32 caratteri casuali. |
| `CLIENT_SECRET` | sì (se dashboard) | — | `src/dashboard/auth.js` | Client secret dell'app Discord (OAuth2). |
| `BASE_URL` | sì (se dashboard) | — | `src/dashboard/auth.js`, comando `/help` | URL pubblico (es. `http://localhost:3000`); deve combaciare col redirect OAuth2 `<BASE_URL>/callback`. Usato anche nel footer di `/help`. |

Note:

- Le chiavi AI sono alternative: basta **una** chiave e il provider è
  scelto in automatico (`AI_PROVIDER=auto`); senza chiavi funziona gratis
  via Pollinations (`AI_API_URL` default).
- Timeout AI fisso 25 s nel codice (`src/utils/aiProviders.js`), non
  configurabile via env.
- Backup sempre ore 03:00 locali e retention 7 giorni: costanti nel codice
  (`src/jobs/backup.js`), non env.
