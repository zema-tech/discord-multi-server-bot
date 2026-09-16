# Discord Multi-Server Bot 🤖

Bot Discord avanzato progettato per funzionare su **più server** contemporaneamente, con tantissime funzioni pronte all'uso.

## 🚀 Funzionalità principali

### Moderazione
- `/ban` - Banna un utente
- `/kick` - Espelli un utente
- `/timeout` - Metti in timeout
- `/warn` - Avvisa un utente
- `/warnings` - Vedi gli avvisi
- `/clear` - Cancella messaggi
- Auto-moderazione (anti-spam, anti-link, bad words)

### Divertimento
- `/meme` - Genera un meme casuale
- `/8ball` - La palla magica 8
- `/joke` - Racconta una barzelletta
- `/coinflip` - Lancia una moneta
- `/rps` - Carta, forbice, sasso

### Economia (semplice)
- `/balance` - Vedi il tuo saldo
- `/daily` - Ritira la ricompensa giornaliera
- `/work` - Lavora per guadagnare
- `/pay` - Invia soldi ad altri utenti
- `/leaderboard` - Classifica dei più ricchi

### Utility
- `/userinfo` - Info su un utente
- `/serverinfo` - Info sul server
- `/ping` - Latenza del bot
- `/avatar` - Mostra l'avatar
- `/help` - Lista comandi

### Sistema
- Benvenuto automatico personalizzabile per server
- Log di moderazione
- Configurazione per-server (prefissi, canali, ruoli)
- Slash commands globali + guild

## 📦 Requisiti

- Node.js 18+
- Token del bot Discord
- Intents abilitati: Guilds, GuildMessages, MessageContent, GuildMembers, GuildModeration

## 🔧 Installazione

1. Clona il repository:
```bash
git clone https://github.com/zema-tech/discord-multi-server-bot.git
cd discord-multi-server-bot
```

2. Installa le dipendenze:
```bash
npm install
```

3. Copia il file di esempio e configura:
```bash
cp .env.example .env
```

4. Modifica `.env` con il tuo token:
```
DISCORD_TOKEN=il_tuo_token_qui
CLIENT_ID=il_tuo_client_id
```

5. Registra i comandi slash:
```bash
node deploy-commands.js
```

6. Avvia il bot:
```bash
npm start
```

## 📁 Struttura del progetto

```
├── src/
│   ├── index.js          # Entry point
│   ├── client.js         # Client Discord
│   ├── commands/         # Comandi slash
│   │   ├── moderation/
│   │   ├── fun/
│   │   ├── economy/
│   │   └── utility/
│   ├── events/           # Event handlers
│   ├── utils/            # Utility functions
│   └── database/         # Sistema di storage (JSON/SQLite)
├── deploy-commands.js
├── package.json
├── .env.example
└── README.md
```

## 🔑 Come ottenere il Token

1. Vai su [Discord Developer Portal](https://discord.com/developers/applications)
2. Crea una nuova applicazione
3. Vai su **Bot** → Reset Token / Copy
4. Abilita gli intents necessari (Privileged Gateway Intents)
5. Invita il bot con i permessi necessari (Administrator consigliato per iniziare)

## 🌐 Multi-Server

Il bot è progettato per funzionare su **tanti server** contemporaneamente. Ogni server può avere:
- Configurazioni separate (canale benvenuto, log, ruoli)
- Dati economia indipendenti
- Impostazioni auto-mod personalizzate

## 🛠️ Tecnologie

- **discord.js** v14
- **Node.js**
- Storage locale (facile da migrare a MongoDB/PostgreSQL)

## 📝 Licenza

MIT License - Fai quello che vuoi!

---

Creato con ❤️ per la community Discord.
