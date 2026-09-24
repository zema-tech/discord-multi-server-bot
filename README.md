# Discord Multi-Server Bot

Bot Discord **multi-server** con moduli attivabili per guild, dashboard web e un **Commander** centrale (gate, timeout, circuit-breaker).

> ~85+ slash command · moderazione · economia · livelli · ticket · AI · musica · utility

---

## Architettura

```text
Dashboard (web)
      │
      ▼
  Commander     ← unico ingresso: toggle, config, esecuzione isolata
   /  |  \
moduli moduli moduli …
```

- I **moduli** non si chiamano tra loro: entrano solo tramite Commander
- Toggle **on/off per server** (default ON)
- Un modulo rotto non spegne il resto (isolamento + breaker)
- Config dashboard: la UI valida, il **Commander esegue**

Pacchetto core tipizzato: `packages/commander` (TypeScript) + bridge JS in `src/modules/commander.js`.

---

## Funzionalità (sintesi)

| Area | Esempi |
|------|--------|
| **Moderazione** | ban, kick, timeout, warn, clear, lockdown, casi |
| **Economia** | balance, daily, bank, shop, lotteria, rob, slots |
| **Livelli** | XP chat/vocale, rank, top, ruoli premio |
| **Ticket** | pannello, claim, transcript, priorità, SLA, rating |
| **AI** | /chiedi, riassumi, brain/skill, provider auto |
| **Utility** | welcome, automod, starboard, reaction roles, giveaway, embed… |
| **Musica** | /musica (play, coda, skip, loop…) |

Lista comandi generata: [docs/COMMANDS.md](docs/COMMANDS.md) · dettagli config: [docs/CONFIG.md](docs/CONFIG.md).

---

## Requisiti

- **Node.js 18+** (22+ se usi `DB_BACKEND=sqlite`)
- Intents: Guilds, GuildMessages, **Message Content**, **Server Members**, GuildModeration (+ voice/invites/reactions già nel codice)
- App Discord con token + Client ID

---

## Setup rapido

```bash
git clone https://github.com/zema-tech/discord-multi-server-bot.git
cd discord-multi-server-bot
npm install
cp .env.example .env   # DISCORD_TOKEN + CLIENT_ID
node deploy-commands.js
npm start
```

Test senza token:

```bash
npm test   # smoke: comandi, eventi, commander, database
```

Per un solo server di prova aggiungi `GUILD_ID` nel `.env` prima del deploy comandi.

---

## Variabili essenziali

| Variabile | Ruolo |
|-----------|--------|
| `DISCORD_TOKEN` | Token bot (obbligatorio) |
| `CLIENT_ID` | Application ID (deploy comandi) |
| `GUILD_ID` | Opzionale: deploy comandi solo su un server |
| `DB_BACKEND` | `json` (default) o `sqlite` |
| `CLIENT_SECRET` + `SESSION_SECRET` + `BASE_URL` | Dashboard OAuth2 |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / … | AI (opzionale; senza chiavi → endpoint free) |

Elenco completo → [docs/CONFIG.md](docs/CONFIG.md) e [`.env.example`](.env.example).

---

## Dashboard web

Pannello per configurare i moduli **senza** rifare tutto in chat.

1. Developer Portal → OAuth2 → redirect: `<BASE_URL>/callback` (scope `identify guilds`)
2. Nel `.env`: `DASHBOARD_PORT`, `SESSION_SECRET`, `CLIENT_SECRET`, `BASE_URL`
3. Avvio:

```bash
npm start            # bot
npm run dashboard    # dashboard (stesso .env / DB)
```

Solo chi ha **Gestisci Server** e ha il bot nel server può modificare quella guild.

---

## Hosting

- **Render / Railway / VPS / Docker / PM2** → [docs/HOSTING.md](docs/HOSTING.md)
- Su Web Service: un processo che espone la porta HTTP e avvia anche il bot (vedi Dockerfile / script di start)

Health check tipico: `GET /healthz` → `ok`, `guilds`, `commands`, `backend`.

---

## Struttura (essenziale)

```text
src/
  index.js              # entry bot
  commands/             # slash per categoria
  events/               # discord events
  modules/              # descrittori feature + commander bridge
  database/             # json / sqlite
  dashboard/            # Express + UI (processo separato)
packages/
  commander/            # core TS: gate, timeout, breaker
apps/                   # scaffold dashboard Next (in evoluzione)
docs/                   # HOSTING, CONFIG, COMMANDS
```

---

## Sviluppo

```bash
npm run dev              # bot con --watch
npm run build:commander  # se modifichi packages/commander (src → dist)
npm test
```

Piano dashboard Next e migrazioni: [PLAN.md](PLAN.md).

---

## Licenza

MIT — vedi repo. Contributi e issue benvenuti.
