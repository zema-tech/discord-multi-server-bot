# Discord Multi-Server Bot 🤖

Bot Discord avanzato per **più server** contemporaneamente — moderazione, economia, livelli XP, automod, welcome, giveaway, ticket professionali e tanto altro. **58 slash command**, zero dipendenze extra oltre `discord.js`.

## 🚀 Funzionalità

### 🛡️ Moderazione (12)
- `/ban` `/kick` `/unban` — ban con pulizia messaggi, kick, unban per ID
- `/timeout` `/untimeout` — mute temporaneo (`30s`, `10m`, `2h`, `1d`)
- `/warn` `/warnings` — warn con escalation automatica (3 warn → timeout 10m), lista/rimozione/pulizia
- `/clear` — cancella 1-100 messaggi, opzionale filtro per utente
- `/slowmode` `/lock` `/nuke` — slowmode, blocco **singolo canale**, rigenerazione canale (con conferma)
- `/lockdown on|off` — **emergenza raid**: blocca TUTTI i canali testuali con snapshot dei permessi e ripristino (`/lock` = singolo canale, `/lockdown` = intero server)

### 🤖 AI (2)
- `/chiedi` — fai una domanda all'AI (endpoint configurabile via `AI_API_URL`, opzionali `AI_API_KEY`/`AI_MODEL`; default gratuito Pollinations)
- `/riassumi` — riassume gli ultimi N messaggi del canale (stesso backend AI)

### 🎮 Divertimento (8)
- `/meme` `/joke` `/8ball` `/coinflip` `/rps` `/dice`
- `/trivia` — quiz a scelta multipla con bottoni (partita per-utente, timeout automatico)
- `/affinita` — calcola l'affinità tra due utenti (deterministica, divertente)

### 💰 Economia (8)
- `/balance` `/daily` (con streak) `/work` `/pay` `/leaderboard`
- `/bank` — deposita/preleva (al sicuro dai furti)
- `/slots` — slot machine con moltiplicatori
- `/rob` — ruba dal portafoglio altrui (45% successo, multa se fallisci)

### ⭐ Livelli (3)
- XP automatico dai messaggi (10-20 XP/min), level-up in chat
- `/rank` `/top`
- `/premi` — ruoli premio automatici per livello (`imposta`/`rimuovi`/`lista`; assegnati al level-up da messaggi e in vocale)
- **Voice XP**: chi resta in vocale (non mutato) guadagna 5 XP/minuto, max 300/sessione; level-up silenzioso con eventuale ruolo premio

### 🔧 Utility (24)
- `/ping` `/userinfo` `/serverinfo` `/avatar` `/help` (auto-generato per categoria, include 🤖 AI)
- `/poll` — sondaggi con reazioni automatiche
- `/giveaway` — estrazione vincitori con 🎉 (storage persistente; il ripristino automatico dopo restart è solo predisposto, i timer vivono in memoria — vedi nota nel codice)
- `/suggest` — suggerimenti con voto ✅/❌
- `/remind` — promemoria in DM (`10m`, `2h`, `1d`)
- `/setup` — configura welcome, goodbye, log, suggerimenti, automod per-server
- `/autorole` — assegna ruoli automatici ai nuovi membri (opzionale ritardo in secondi)
- `/starboard` — configura la bacheca ⭐ (messaggi con N reazioni ripubblicati nel canale starboard)
- `/snipe` — mostra l'ultimo messaggio eliminato nel canale (cache in memoria, niente storage)
- `/reactionroles` — pannello self-service con menu di selezione (`crea`/`aggiungi`/`rimuovi`/`pubblica`/`elimina`; assegna/rimuove con toggle, controlli gerarchia inclusi)
- `/autoresponder` — risposte automatiche a parole chiave (`aggiungi` con modo include/exact/regex, `{user}` = menzione; `rimuovi`/`lista`/`pulisci`; lo staff è esente, cooldown anti-spam 5s)
- `/inviti` — statistiche invite tracker (`info [utente]`, `classifica` top 10; gli altri vedono solo le proprie, serve Gestisci Server per quelle altrui)
- `/tempvoice` — configura le vocali temporanee (`imposta` lobby + categoria, `mostra`, `disattiva`; serve Gestisci Server)
- `/voice` — gestisci la TUA vocale temporanea (`nome`/`limite`/`blocca`/`sblocca`/`kick`; solo proprietario o staff, devi esserci dentro)
- `/stanza` — stanze private personali (`crea` testuale/vocale max 3 per utente, poi `aggiungi`/`rimuovi`/`elimina` dentro la stanza; solo proprietario o staff)
- `/embed` — crea un embed personalizzato con anteprima e invialo nel canale scelto
- `/evento` — eventi programmati del server (`crea` con data `GG/MM/AAAA HH:MM`, `lista`, `elimina`)
- `/template` — applica un template di struttura al server (`lista`/`anteprima`/`applica`; crea solo ruoli/canali, non cancella mai nulla)
- `/costruisci` — genera la struttura del server con la AI da una descrizione (anteprima + conferma con bottoni entro 60s; serve Gestisci Server)
- `/analytics` — statistiche stile YouTube-Studio (messaggi e membri per giorno, ultimi 1-30 giorni, con barre testuali)

### 🎫 Ticket (1 comando, 9 sotto-comandi)
- `/ticket setup` — configura panel, categoria, log, ruoli staff, max per utente
- `/ticket panel` — ripubblica il pannello con menu di selezione (Supporto, Bug, Appeal, Partnership)
- Canali privati con permessi automatici, pulsante **Prendi in carico** (claim), **Chiudi** con motivo + **transcript .txt** (log + DM al proprietario), **Riapri**, **Elimina**
- `/ticket aggiungi|rimuovi|claim|chiudi|riapri|transcript|stats`
- **Auto-chiusura inattivi** (`src/jobs/ticketAutoclose.js`, avviato da `ready.js` ogni 15 min, prima passata dopo 60s): chiude i ticket aperti senza attività da N giorni (`setAutoClose(guildId, giorni)`, 0 = off, max 90; `lastActivityAt` aggiornata a ogni messaggio con throttle 60s). La chiusura automatica usa l'utente bot come autore ed è registrata come le chiusure manuali (embed + transcript + log + DM).

### ⚙️ Sistema
- **Automoderazione**: anti-spam (5 msg/5s), anti-link, anti-invite, bad words, anti-mention, anti-caps — lo staff è esente
- **Anti-raid**: tracker join in memoria (`src/utils/antiRaid.js`); oltre la soglia (join/30s) log su console + embed nel canale log (nessuna azione automatica — valuta `/lockdown on`). Listener dedicato `src/events/antiRaid.js` su `guildMemberAdd` (multi-listener voluto assieme a welcome + autorole, vedi nota sotto)
- **Audit-log**: `src/events/auditLog.js` — logga ban/unban/timeout/mute/eliminazioni nel canale log configurato
- **Invite tracker**: cache inviti per-server (`src/database/invites.js`); `inviteCreate.js`/`inviteDelete.js` aggiornano la cache in incrementale, `inviteTracker.js` attribuisce ogni join confrontando gli `uses` (1 solo candidato con delta > 0, altrimenti "sconosciuto"), logga l'embed nel canale log e conta le uscite (lazy-attach di `GuildMemberRemove`)
- **Analytics**: conteggi giornalieri messaggi/joins/leaves (`src/database/analytics.js` + listener `analyticsMessages.js`/`analyticsMembers.js`, solo conteggi, mai contenuti); lettura con `/analytics`
- **Vocali temporanee**: lobby → canale personale auto-creato con permessi (`tempVoice.js`: creazione all'ingresso, eliminazione quando resta vuota); gestione con `/voice`, configurazione con `/tempvoice`
- **Welcome/Goodbye** personalizzabili con `{user}` `{username}` `{server}` `{count}`
- **Log moderazione** su canale dedicato
- **Configurazione per-server** (`/setup mostra`) + storage JSON locale

> **Nota multi-listener**: `index.js` registra un listener per file (`client.on`), quindi più file ascoltano lo stesso evento facendo cose diverse — è un pattern voluto; lo smoke test lo segnala come WARNING, non errore. Casi attuali: `guildMemberAdd` ×5 (welcome, autorole, antiRaid, analytics joins, invite tracker), `messageCreate` ×3 (XP/automod + touch ticket, autoresponder, conteggio analytics), `voiceStateUpdate` ×2 (vocali temporanee, voice XP). Altri duplicati restano errori.

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

Test di coerenza (non avvia il bot, non richiede token):

```bash
npm test   # = node scripts/smoke-test.js (comandi, eventi, database, customId)
```

Per l'AI nessun setup obbligatorio: di default usa l'endpoint gratuito Pollinations. Opzionalmente imposta `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` nel `.env` (vedi `.env.example`).

## 📁 Struttura

```
├── src/
│   ├── index.js
│   ├── commands/
│   │   ├── ai/            # 2 comandi (chiedi, riassumi)
│   │   ├── moderation/    # 12 comandi
│   │   ├── fun/           # 8 comandi
│   │   ├── economy/       # 8 comandi
│   │   ├── levels/        # 3 comandi (rank, top, premi)
│   │   ├── utility/       # 24 comandi (incl. autorole, snipe, starboard, reactionroles, autoresponder, inviti, tempvoice, voice, stanza, embed, evento, template, costruisci, analytics)
│   │   └── tickets/       # 1 comando (9 sotto-comandi)
│   ├── events/          # ready, interactionCreate (ticket + reaction roles + nuke), messageCreate x3 (XP/automod, autoresponder, analytics), messageReactionAdd (starboard), guildMemberAdd x5 (welcome/autorole/antiRaid/analytics/inviteTracker), guildMemberRemove (+ lazy-attach analytics e inviteTracker), auditLog (messageDelete + altri, lazy-attach), inviteCreate/inviteDelete (cache), voiceStateUpdate x2 (tempVoice, voiceXp)
│   ├── handlers/        # ticketHandler, reactionRoleHandler
│   ├── jobs/            # ticketAutoclose (auto-chiusura ticket inattivi)
│   ├── utils/           # helpers (embed, log, gerarchia ruoli), ai, antiRaid, snipeCache, blueprints (template/costruisci), transcript
│   └── database/        # JSON: economy, levels, warnings, guildConfig, tickets, autorole, lockdown, starboard, reactionRoles, autoresponder, invites, tempvoice, stanze, levelRewards, analytics
├── scripts/
│   └── smoke-test.js    # `npm test`
├── deploy-commands.js
└── package.json
```

## 🌐 Multi-Server

Ogni server ha dati indipendenti: economia, livelli, warn, ticket, config welcome/log/automod, reaction roles, autoresponder, inviti, tempvoice, stanze, premi livello, analytics.

## 🛠️ Tecnologie

- **discord.js** v14 · **Node.js** · Storage JSON (migrabile a MongoDB/PostgreSQL)

## 📝 Licenza

MIT — fai quello che vuoi!

---

Creato con ❤️ per la community Discord.
