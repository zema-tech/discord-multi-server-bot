# Discord Multi-Server Bot

![Node](https://img.shields.io/badge/node-22%2B-brightgreen)
![discord.js](https://img.shields.io/badge/discord.js-v14-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Commands](https://img.shields.io/badge/slash%20commands-85%2B-orange)

Bot Discord **multi-server** con ~85 slash command, moduli attivabili per guild, **dashboard web** e un **Commander** centrale (gate, timeout, circuit-breaker).

## Perché è diverso

- **Commander** — unico ingresso: toggle per server, esecuzione isolata, un modulo rotto non spegne gli altri
- **AI plug-and-play** — una chiave (Groq, Gemini, OpenAI, …) oppure endpoint free; brain/skill per guild
- **Ticket professionali** — claim, transcript, priorità, SLA, rating
- **Moderazione seria** — warn con escalation, lockdown con snapshot permessi, registro casi
- **Dashboard web** — OAuth2 Discord, config moduli senza rifare tutto in chat

## Avvio rapido

```bash
git clone https://github.com/zema-tech/discord-multi-server-bot.git
cd discord-multi-server-bot
npm install
cp .env.example .env   # DISCORD_TOKEN + CLIENT_ID
node deploy-commands.js
npm start
```

```bash
npm test   # smoke senza token: comandi, eventi, commander, DB
```

## Indice

| Sezione | Contenuto |
|---------|-----------|
| [Architettura](#architettura) | Dashboard → Commander → moduli |
| [Funzionalità](#funzionalità-sintesi) | Panoramica per area |
| [Requisiti](#requisiti) | Node, intents |
| [Variabili](#variabili-essenziali) | Env minime |
| [Dashboard](#dashboard-web) | OAuth2 e avvio |
| [Hosting](#hosting) | Render, Docker, VPS |
| [Docs](docs/) | [CONFIG](docs/CONFIG.md) · [COMMANDS](docs/COMMANDS.md) · [HOSTING](docs/HOSTING.md) · [PLAN](PLAN.md) |

---

## Architettura

```text
Dashboard (web)
      │
      ▼
  Commander     ← toggle, config, esecuzione isolata
   /  |  \
moduli moduli moduli …
```

- I moduli non si chiamano tra loro: solo tramite Commander
- Toggle **on/off per server** (default ON)
- Config dashboard: la UI valida, il **Commander esegue**
- Core tipizzato: `packages/commander` (TypeScript) + bridge in `src/modules/commander.js`

---

## Funzionalità (sintesi)

| Area | Esempi |
|------|--------|
| **Moderazione** | ban, kick, timeout, warn, clear, lockdown, casi |
| **Economia** | balance, daily, bank, shop, lotteria, rob, slots |
| **Livelli** | XP chat/vocale, rank, top, ruoli premio |
| **Ticket** | pannello, claim, transcript, priorità, SLA, rating |
| **AI** | /chiedi, riassumi, brain/skill, provider auto |
| **Utility** | welcome, automod, starboard, reaction roles, giveaway… |
| **Musica** | /musica (play, coda, skip, loop…) |

Dettaglio comandi → [docs/COMMANDS.md](docs/COMMANDS.md).

---

## Requisiti

- **Node.js 18+** (22+ con `DB_BACKEND=sqlite`)
- Intents: Guilds, GuildMessages, **Message Content**, **Server Members**, GuildModeration
- App Discord: token + Client ID

---

## Variabili essenziali

| Variabile | Ruolo |
|-----------|--------|
| `DISCORD_TOKEN` | Token bot |
| `CLIENT_ID` | Deploy comandi |
| `GUILD_ID` | Opzionale: un solo server di test |
| `DB_BACKEND` | `json` (default) o `sqlite` |
| `CLIENT_SECRET` · `SESSION_SECRET` · `BASE_URL` | Dashboard OAuth2 |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / … | AI (opzionale) |

Completo → [docs/CONFIG.md](docs/CONFIG.md) · [`.env.example`](.env.example).

---

## Dashboard web

1. Developer Portal → OAuth2 → redirect `<BASE_URL>/callback` (scope `identify guilds`)
2. Env: `DASHBOARD_PORT`, `SESSION_SECRET`, `CLIENT_SECRET`, `BASE_URL`
3. Avvio:

```bash
npm start            # bot
npm run dashboard    # pannello (stesso .env / DB)
```

Serve **Gestisci Server** + bot presente nella guild.

> Screenshot dashboard: in arrivo (apri una issue se vuoi contribuire GIF/PNG).

---

## Hosting

[docs/HOSTING.md](docs/HOSTING.md) — Docker, PM2, Render, Railway, VPS.

Health: `GET /healthz` → `ok`, `guilds`, `commands`, `backend`.

---

## Struttura

```text
src/commands/   slash per categoria
src/events/     listener Discord
src/modules/    descrittori feature + commander bridge
src/database/   json / sqlite
src/dashboard/  Express + UI
packages/commander/   core TS (gate, timeout, breaker)
docs/           CONFIG, COMMANDS, HOSTING
```

```bash
npm run dev
npm run build:commander   # dopo modifiche a packages/commander
npm test
```

---

## Licenza

[MIT](LICENSE) — contributi e issue benvenuti.
