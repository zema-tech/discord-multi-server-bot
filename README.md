# Discord Multi-Server Bot 🤖

Bot Discord avanzato per **più server** contemporaneamente — moderazione, economia, livelli XP, automod, welcome, giveaway, ticket professionali e tanto altro. **84 slash command**, dipendenze in `package.json`: `discord.js` (+ `express` solo per la dashboard web opzionale, più lo stack musica `discord-player`/`@discordjs/voice`/extractor).

## 🚀 Funzionalità

### 🛡️ Moderazione (13)
- `/ban` `/kick` `/unban` — ban con pulizia messaggi, kick, unban per ID
- `/timeout` `/untimeout` — mute temporaneo (`30s`, `10m`, `2h`, `1d`)
- `/warn` `/warnings` — warn con escalation automatica (3 warn → timeout 10m), lista/rimozione/pulizia
- `/clear` — cancella 1-100 messaggi, opzionale filtro per utente
- `/slowmode` `/lock` `/nuke` — slowmode, blocco **singolo canale**, rigenerazione canale (con conferma)
- `/lockdown on|off` — **emergenza raid**: blocca TUTTI i canali testuali con snapshot dei permessi e ripristino (`/lock` = singolo canale, `/lockdown` = intero server)
- `/caso` — storico moderazione per utente (`mostra` casi + note, `nota` aggiunge nota staff, `rimuovi` elimina un caso, `cerca` filtra per tipo; ogni `/ban` `/kick` `/timeout` `/unban` `/warn` scrive un caso in automatico)

### 🤖 AI (7 + extra)
Provider plug-and-play: basta **una chiave** nel `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` o `OPENROUTER_API_KEY`) e il bot la usa da solo (`AI_PROVIDER=auto`; `AI_MODEL` opzionale). Senza chiavi: Pollinations gratuito. `/ai-config mostra` dice sempre quale provider è attivo.
- `/chiedi` — fai una domanda all'AI (usa il prompt di sistema del server se impostato)
- `/riassumi` — riassume gli ultimi N messaggi del canale (stesso backend AI)
- `/immagina` — genera un'immagine dal prompt (rispetta `fun-ai`)
- `/storia` — storia generativa interattiva con bottoni (rispetta `fun-ai`)
- `/analizza` — 5 insight azionabili per far crescere il server (serve Gestisci Server; niente chiamata AI se gli analytics sono vuoti)
- `/codice` — l'AI conosce il proprio codice: `chiedi` (risponde con fonti), `file`, `cerca`, `albero` (serve Gestisci Server per `chiedi`)
- `/ai-config` — configura l'AI del server (serve Gestisci Server): `mostra` (include provider attivo) · `mention on/off` (risposta alle menzioni, default OFF) · `automod-ai on/off` · `ticket-ai on/off` · `fun-ai on/off` · `prompt <testo>` · `prompt-reset`
- Extra automatiche (fuori slash): risposta alle menzioni (`mentionReply`, default OFF), analisi AI dei messaggi sospetti (`automodAI`, default OFF), AI nei ticket (`ticketAI`, default ON)

### 🌙 Self-improvement (1)
- `/selfimprove stato|prova|esegui` (serve Gestisci Server) — ogni sera (default ore 22:00, `SELF_IMPROVE=1`) il bot rilegge il suo codice, propone **una** piccola patch e la applica **solo** se `node --check` + smoke test passano, altrimenti rollback automatico. Mai commit automatici, mai tocco a working tree sporco. Config: `SELF_IMPROVE_TIME`, `SELF_IMPROVE_DRY_RUN=1`, `SELF_IMPROVE_GUILD_ID` (report nel canale log).

### 🎮 Divertimento (13)
- `/meme` `/joke` `/8ball` `/coinflip` `/rps` `/dice`
- `/trivia` — quiz a scelta multipla con bottoni (partita per-utente, timeout automatico)
- `/affinita` — calcola l'affinità tra due utenti (deterministica, divertente)
- `/oroscopo` — oroscopo giornaliero deterministico per segno (amore/lavoro/fortuna + numero e colore fortunato)
- `/preferiresti` — dilemma A/B con voto a bottoni (60s, voto cambiabile, percentuali finali)
- `/confessa` — confessioni anonime (`imposta` canale, staff con Gestisci Server; `invia` max 500 caratteri con cooldown anti-abuso)
- `/animale` — foto casuale di gatto o cane (API gratuite con timeout + fallback)
- `/sfida` — sfida settimanale del server (progresso dai messaggi, mini-classifica, premio in monete)

### 💰 Economia (11)
- `/balance` `/daily` (con streak) `/work` `/pay` `/leaderboard`
- `/bank` — deposita/preleva (al sicuro dai furti)
- `/slots` — slot machine con moltiplicatori
- `/rob` — ruba dal portafoglio altrui (45% successo, multa se fallisci)
- `/shop` — negozio ruoli (`lista`/`compra` per tutti; `aggiungi`/`rimuovi` staff con Gestisci Ruoli, con controlli gerarchia)
- `/lotteria` — lotteria del server (`info`/`compra` fino a 5 biglietti; `estrai` staff con Gestisci Server, estrazione automatica alla soglia)
- `/rep` — reputazione (`dai` +1 con cooldown 24h per coppia, `mostra`, `classifica` top 10)

### ⭐ Livelli (3)
- XP automatico dai messaggi (10-20 XP/min), level-up in chat
- `/rank` `/top`
- `/premi` — ruoli premio automatici per livello (`imposta`/`rimuovi`/`lista`; assegnati al level-up da messaggi e in vocale)
- **Voice XP**: chi resta in vocale (non mutato) guadagna 5 XP/minuto, max 300/sessione; level-up silenzioso con eventuale ruolo premio

### 🎵 Musica (1)
- `/musica` con sottocomandi: `play` (ricerca YouTube o link, accoda in coda), `skip` · `stop` · `pausa` · `riprendi` · `coda` (prossimi 10 brani + progress bar) · `volume` · `mescola` · `loop`
- Richiede i permessi **Connetti** + **Parla** nel vocale; utente e bot devono stare nello stesso vocale per i controlli; errori mappati in italiano (timeout ricerca, nessun risultato, permessi, audio host mancante)
- **Dipendenze persistenti in `package.json` (versioni esatte)**: `discord-player@7.2.0`, `@discordjs/voice@0.19.2`, `@discord-player/extractor@7.2.0`, `discord-player-youtubei@3.1.0`, `simple-ytdl-core@1.1.1`. Singleton lazy in `src/utils/player.js` con fallback: se lo stack manca, il comando risponde "modulo musica non installato" senza crashare bot né smoke test

### 🔧 Utility (34)
- `/ping` `/userinfo` `/serverinfo` `/avatar` `/help` (auto-generato per categoria: copre tutte le cartelle comandi — moderation, fun, economy, levels, utility, tickets, ai, music — più "altri" come fallback; generato dinamicamente da `client.commands`, quindi include sempre i nuovi comandi senza aggiornamenti manuali)
- `/profilo` — profilo completo dell'utente (livello, saldo+banca, rep, warn, ingresso, top 3 ruoli)
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
- `/analytics` — statistiche stile YouTube-Studio (serve Gestisci Server; messaggi e membri per giorno, ultimi 1-30 giorni, con barre testuali)
- `/meteo` — meteo di una città via Open-Meteo gratis (geocoding + previsione 1-7 giorni, timeout 10s + fallback)
- `/traduci` — traduci un testo via MyMemory gratis (max 500 caratteri, `da`/`a` con whitelist lingue, default auto→it)
- `/qr` — genera un QR code dal testo (max 500 caratteri, colore esadecimale opzionale, via api.qrserver.com)
- `/selfimprove` — vedi sezione 🌙 Self-improvement sopra (`stato`/`prova`/`esegui`, serve Gestisci Server)
- `/lingua mostra|imposta it|en` — lingua del bot per il server (serve Gestisci Server per `imposta`; comandi migrati: vedi sezione 🌐 i18n sotto)
- `/comando` — comandi custom del server (`crea`/`modifica`/`elimina`/`lista`, max 20 per server, risposta max 500 caratteri con variabili `{user}` `{username}` `{server}` `{count}` `{canale}` `{data}`; trigger anche via `!nome` in chat con cooldown 3s)
- `/export server|backup-ora|backup-lista` — bundle JSON dei dati del server (allegato, max 8 MB), backup immediato + report, ultime 7 cartelle di backup (serve Gestisci Server)

### 🎫 Ticket (2 comandi)
- `/ticket` con 9 sotto-comandi: `setup` (panel, categoria, log, ruoli staff, max per utente) · `panel` (ripubblica il pannello con menu Supporto/Bug/Appeal/Partnership) · `aggiungi` · `rimuovi` · `claim` · `chiudi` · `riapri` · `transcript` · `stats`
- `/ticket-ai` — risposte AI automatiche nei ticket (rispetta `ticket-ai` da `/ai-config`)
- Canali privati con permessi automatici, pulsante **Prendi in carico** (claim), **Chiudi** con motivo + **transcript .txt** (log + DM al proprietario), **Riapri**, **Elimina**
- `/ticket aggiungi|rimuovi|claim|chiudi|riapri|transcript|stats`
- **Auto-chiusura inattivi** (`src/jobs/ticketAutoclose.js`, avviato da `ready.js` ogni 15 min, prima passata dopo 60s): chiude i ticket aperti senza attività da N giorni (`setAutoClose(guildId, giorni)`, 0 = off, max 90; `lastActivityAt` aggiornata a ogni messaggio con throttle 60s). La chiusura automatica usa l'utente bot come autore ed è registrata come le chiusure manuali (embed + transcript + log + DM).

### 🔐 Permessi personalizzati (stile PeakBot)
- `/permessi imposta <comando> <ruolo…>` — limita un comando a max 5 ruoli (serve Gestisci Server; `/permessi` stesso non è limitabile, gli Amministratori restano sempre esclusi dal blocco)
- `/permessi rimuovi <comando> [ruolo]` — togli un ruolo o resetta il comando · `/permessi mostra [comando]` · `/permessi reset` (con conferma a bottoni, 30s)
- Check in `interactionCreate` **prima** del cooldown: chi viene respinto non consuma attesa
- Stesse regole esposte via dashboard: `PUT /api/guilds/:gid/perms` (`{ command, roleIds }`; `roleIds: []` = reset del comando)

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

Per l'AI nessun setup obbligatorio: di default usa l'endpoint gratuito Pollinations. Per un'AI più potente basta **una sola chiave** nel `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` o `OPENROUTER_API_KEY`) — il bot la rileva da solo (`AI_PROVIDER=auto`, `AI_MODEL` opzionale, vedi `.env.example`). Le funzioni per-server (`mentionReply`, `automodAI`, `ticketAI`, `funAI`, prompt di sistema) si configurano con `/ai-config` (serve Gestisci Server) o dalla dashboard.

## 🌐 Dashboard web (opzionale, stesso processo del bot)

Pannello web per configurare ogni server senza comandi: moduli (welcome, automod, ticket, livelli, AI, log, vocali temporanee), permessi custom e statistiche.

**Prerequisiti OAuth2** (portale [Discord Developer](https://discord.com/developers/applications)):
1. Apri la tua applicazione → **OAuth2 → General** → aggiungi il redirect: `<BASE_URL>/callback` (es. `http://localhost:3000/callback`).
2. Copia il **Client Secret** (serve per lo scambio code→token). Gli scope usati sono `identify guilds`.

**Env** (vedi `.env.example`):
```bash
DASHBOARD_PORT=3000
SESSION_SECRET=una_stringa_lunga_casuale_da_almeno_32_caratteri
CLIENT_ID=quello_che_hai_già
CLIENT_SECRET=il_client_secret_dell_app
BASE_URL=http://localhost:3000
```

**Avvio e URL**:
```bash
npm install   # serve express (già in package.json)
npm start     # la dashboard parte SOLO se DASHBOARD_PORT è impostato; un suo errore non spegne mai il bot
```
- `http://localhost:3000/` → landing con login · `/login` → OAuth2 Discord (con `state` anti-CSRF su cookie) · `/logout`
- API (richiedono login + Gestisci Server sulla guild + bot presente): `GET /api/me` · `GET /api/guilds` (icone come URL CDN completi) · `GET /api/guilds/:gid` · `GET /api/guilds/:gid/schema` · `GET /api/guilds/:gid/meta` · `PUT /api/guilds/:gid/modules/:mod` · `PUT /api/guilds/:gid/perms`
- Solo chi ha **Gestisci Server** sulla guild vede/modifica quella guild; il bot deve esserci dentro (altrimenti 403).

## 📁 Struttura

```
├── src/
│   ├── index.js
│   ├── commands/
│   │   ├── ai/            # 7 comandi (chiedi, riassumi, immagina, storia, analizza, ai-config, codice)
│   │   ├── moderation/    # 13 comandi
│   │   ├── fun/           # 13 comandi (meme, joke, 8ball, coinflip, rps, dice, trivia, affinita, oroscopo, preferiresti, confessa, animale, sfida)
│   │   ├── economy/       # 11 comandi (balance, daily, work, pay, leaderboard, bank, slots, rob, shop, lotteria, rep)
│   │   ├── levels/        # 3 comandi (rank, top, premi)
│   │   ├── music/         # 1 comando (musica con 8 sotto-comandi: play/skip/stop/pausa/riprendi/coda/volume/mescola/loop)
│   │   ├── utility/       # 34 comandi (incl. autorole, snipe, starboard, reactionroles, autoresponder, inviti, tempvoice, voice, stanza, embed, evento, template, costruisci, analytics, permessi, wizard, meteo, traduci, qr, profilo, selfimprove, lingua, comando, export)
│   │   └── tickets/       # 2 comandi (ticket con 9 sotto-comandi, ticket-ai)
│   ├── events/          # ready, interactionCreate (ticket + reaction roles + nuke; check permessi custom PRIMA del cooldown; logging comandi + report errori nel canale log), messageCreate x5 (XP/automod, autoresponder, analytics, customCommands `!nome`, AI mention/moderation), messageReactionAdd (starboard), guildMemberAdd x5 (welcome/autorole/antiRaid/analytics/invite tracker), guildMemberRemove (+ lazy-attach analytics e inviteTracker), auditLog (messageDelete + altri, lazy-attach), inviteCreate/inviteDelete (cache), voiceStateUpdate x2 (tempVoice, voiceXp), aiMention, aiModeration
│   ├── handlers/        # ticketHandler, reactionRoleHandler
│   ├── jobs/            # ticketAutoclose (auto-chiusura ticket inattivi), backup (snapshot notturno ore 03:00 in backups/, retention 7 giorni, avviato da ready.js)
│   ├── locales/         # it.js, en.js (stringhe i18n; nomi/descrizioni slash restano in IT)
│   ├── dashboard/       # server.js (startDashboard, lazy express), api.js (REST /api/*), auth.js (OAuth2 + sessione su cookie firmato con state anti-CSRF)
│   │   └── public/      # index.html, app.html, app.js (vanilla JS, solo textContent), styles.css
│   ├── utils/           # helpers (embed, log, gerarchia ruoli), ai, aiProviders, antiRaid, snipeCache, blueprints (template/costruisci), transcript, wizardSteps, i18n (mini-i18n IT/EN), logger (JSON-lines su console + logs/), player (singleton discord-player lazy con fallback), codebase (indice per /codice)
│   └── database/        # JSON: economy, levels, warnings, guildConfig (+language), tickets (+ autoCloseDays), autorole, lockdown, starboard, reactionRoles, autoresponder, invites, tempvoice, stanze, levelRewards, analytics, aiConfig, customPerms, shop, lotteria, rep, sfide, confessioni, cases (storico moderazione), customCommands (+ store.js compat json/sqlite, postgres-schema.sql solo schema futuro)
├── scripts/
│   └── smoke-test.js    # `npm test`
├── deploy-commands.js
└── package.json
```

Totale comandi = file in `src/commands/*/*.js` (1 file = 1 slash command): **84** (13+13+11+3+34+1+2+7).

> **Restyling premium**: embed uniformati in tutto il bot — footer "Richiesto da …", numeri in formato `it-IT`, colori oro per l'economia, timestamp e miniature utente dove utili.

## 🗺️ Roadmap (completata)

1. **SQLite / store** — `src/database/store.js`: API sincrona a collection (`get`/`set`/`update`/`delete`/`all`) con backend da env `DB_BACKEND=json|sqlite` (`DB_SQLITE_PATH`, default `./data/bot.db`). Backend `json` byte-identico allo storico (stessi path, zero migrazione); backend `sqlite` via `node:sqlite` (Node 22+, tabella `kv`, WAL, transazioni, fallback a json mai-crash). `jsonDb.js` è un compat-layer invariato sopra `store.js`: i ~25 moduli esistenti funzionano senza modifiche.
2. **Musica** — `/musica` (8 sotto-comandi, vedi sopra). Dipendenze persistenti in `package.json` a versioni esatte: `discord-player@7.2.0`, `@discordjs/voice@0.19.2`, `@discord-player/extractor@7.2.0`, `discord-player-youtubei@3.1.0`, `simple-ytdl-core@1.1.1` (+ `npm install` già eseguito). `src/utils/player.js` è lazy con fallback: senza stack vocale, i comandi rispondono con messaggio utente e lo smoke test resta verde.
3. **Case moderazione** — `src/database/cases.js` + `/caso`: hook automatici in `ban/kick/timeout/unban/warn` (best-effort, mai bloccanti) + note staff, ricerca per utente/tipo, rimozione singoli casi.
4. **Backup / export** — `src/jobs/backup.js`: snapshot notturno ore 03:00 in `backups/YYYY-MM-DD-HHmm/` (JSON + sqlite se presente), retention 7 giorni, journal `backups/last.json`, avviato da `ready.js`. `/export` espone `server` (bundle JSON allegato) · `backup-ora` (run immediato + report) · `backup-lista` (ultime 7).
5. **Logging** — `src/utils/logger.js`: JSON-lines su console colorata + `logs/YYYY-MM-DD.log` (rotazione per data, IO best-effort), livelli da `LOG_LEVEL` (default `info`), `logger.child(ctx)`, `logCommand()` per uso comandi (solo ID, mai contenuti). `interactionCreate.js` logga durata/esiti ed errori (console + canale log della guild); `index.js` logga `unhandledRejection`/`uncaughtException`.
6. **Custom commands** — `src/database/customCommands.js` + `/comando` + listener `src/events/customCommands.js` (trigger `!nome`, cooldown 3s, variabili di risposta, contatore usi). Quarto listener `messageCreate` voluto assieme a XP/automod, autoresponder e analytics (smoke test: WARNING, non errore).
7. **🌐 i18n** — `src/utils/i18n.js` + `src/locales/it.js`/`en.js`: `t(chiave, lang, vars)` con fallback IT, `getLang`/`setLang` via `guildConfig.language`, `/lingua` per impostarla. **Stato migrazione: 6 comandi** (`help`, `serverinfo`, `userinfo`, `avatar`, `ping`, `8ball`) con embed premium + `t()` fusi (nessun conflitto perso); nomi/descrizioni slash restano in IT per scelta. Da migrare: tutti gli altri comandi restano in italiano hardcoded.

## 🌐 Multi-Server

Ogni server ha dati indipendenti: economia, livelli, warn, ticket, config welcome/log/automod, reaction roles, autoresponder, inviti, tempvoice, stanze, premi livello, analytics, shop, lotteria, rep, sfide, confessioni.

## 🛠️ Tecnologie

- **discord.js** v14 · **Node.js** 18+ (24 consigliato per `node:sqlite`) · Storage JSON o SQLite (`DB_BACKEND`, migrabile a PostgreSQL via `src/database/postgres-schema.sql`, solo schema futuro — `pg` NON installato di proposito) · Musica via `discord-player` (vedi § Roadmap/2)

## 📝 Licenza

MIT — fai quello che vuoi!

---

Creato con ❤️ per la community Discord.
