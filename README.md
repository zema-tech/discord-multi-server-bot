# Discord Multi-Server Bot 🤖

Bot Discord avanzato per **più server** contemporaneamente — moderazione, economia, livelli XP, automod, welcome, giveaway, ticket professionali e tanto altro. **38 slash command**, zero dipendenze extra oltre `discord.js`.

## 🚀 Funzionalità

### 🛡️ Moderazione (10)
- `/ban` `/kick` `/unban` — ban con pulizia messaggi, kick, unban per ID
- `/timeout` `/untimeout` — mute temporaneo (`30s`, `10m`, `2h`, `1d`)
- `/warn` `/warnings` — warn con escalation automatica (3 warn → timeout 10m), lista/rimozione/pulizia
- `/clear` — cancella 1-100 messaggi, opzionale filtro per utente
- `/slowmode` `/lock` `/nuke` — slowmode, blocco canale, rigenerazione canale (con conferma)

### 🎮 Divertimento (6)
- `/meme` `/joke` `/8ball` `/coinflip` `/rps` `/dice`

### 💰 Economia (8)
- `/balance` `/daily` (con streak) `/work` `/pay` `/leaderboard`
- `/bank` — deposita/preleva (al sicuro dai furti)
- `/slots` — slot machine con moltiplicatori
- `/rob` — ruba dal portafoglio altrui (45% successo, multa se fallisci)

### ⭐ Livelli (2)
- XP automatico dai messaggi (10-20 XP/min), level-up in chat
- `/rank` `/top`

### 🔧 Utility (11)
- `/ping` `/userinfo` `/serverinfo` `/avatar` `/help` (auto-generato, 37 comandi)
- `/poll` — sondaggi con reazioni automatiche
- `/giveaway` — estrazione vincitori con 🎉
- `/suggest` — suggerimenti con voto ✅/❌
- `/remind` — promemoria in DM (`10m`, `2h`, `1d`)
- `/setup` — configura welcome, goodbye, log, suggerimenti, automod per-server

### 🎫 Ticket (1 comando, 9 sotto-comandi)
- `/ticket setup` — configura panel, categoria, log, ruoli staff, max per utente
- `/ticket panel` — ripubblica il pannello con menu di selezione (Supporto, Bug, Appeal, Partnership)
- Canali privati con permessi automatici, pulsante **Prendi in carico** (claim), **Chiudi** con motivo + **transcript .txt** (log + DM al proprietario), **Riapri**, **Elimina**
- `/ticket aggiungi|rimuovi|claim|chiudi|riapri|transcript|stats`

### ⚙️ Sistema
- **Automoderazione**: anti-spam (5 msg/5s), anti-link, anti-invite, bad words, anti-mention, anti-caps — lo staff è esente
- **Welcome/Goodbye** personalizzabili con `{user}` `{username}` `{server}` `{count}`
- **Log moderazione** su canale dedicato
- **Configurazione per-server** (`/setup mostra`) + storage JSON locale

## 📦 Requisiti

- Node.js 18+
- Intents: Guilds, GuildMessages, MessageContent, GuildMembers, GuildModeration (+ Reactions, VoiceStates, Invites già nel codice)
- Permessi consigliati: Administrator (o almeno Ban/Kick/Timeout/Manage Messages/Channels)

## 🔧 Installazione

```bash
git clone https://github.com/zema-tech/discord-multi-server-bot.git
cd discord-multi-server-bot
npm install
cp .env.example .env   # poi inserisci DISCORD_TOKEN e CLIENT_ID
node deploy-commands.js
npm start
```

Per test veloci su un solo server aggiungi `GUILD_ID` nel `.env` prima del deploy.

## 📁 Struttura

```
├── src/
│   ├── index.js
│   ├── commands/
│   │   ├── moderation/  # 10 comandi
│   │   ├── fun/         # 6 comandi
│   │   ├── economy/     # 8 comandi
│   │   ├── levels/      # 2 comandi
│   │   └── utility/     # 11 comandi
│   ├── events/          # ready, interactionCreate, messageCreate, guildMemberAdd/Remove
│   ├── utils/           # helpers (embed, log, gerarchia ruoli)
│   └── database/        # JSON: economy, levels, warnings, guildConfig
├── deploy-commands.js
└── package.json
```

## 🌐 Multi-Server

Ogni server ha dati indipendenti: economia, livelli, warn, ticket, config welcome/log/automod.

## 🛠️ Tecnologie

- **discord.js** v14 · **Node.js** · Storage JSON (migrabile a MongoDB/PostgreSQL)

## 📝 Licenza

MIT — fai quello che vuoi!

---

Creato con ❤️ per la community Discord.
