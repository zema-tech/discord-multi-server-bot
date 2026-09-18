# Architettura del bot

Mappa ricavata leggendo il codice (entry point `src/index.js`, eventi,
database, dashboard, job). Nomi di file e comportamenti corrispondono a
quanto implementato, non a intenzioni future.

## Panoramica

Bot Discord multi-server basato su **discord.js v14**, **CommonJS**,
**singolo processo Node** (`node src/index.js`). Comandi slash organizzati
per categoria-cartella, stato persistente in JSON (con backend SQLite
opzionale), dashboard web opzionale nello stesso processo, job periodici
avviati all'evento ready. Dettaglio variabili in `CONFIG.md`, comandi in
`COMMANDS.md` (generato con `node scripts/gen-docs.js`).

## Struttura cartelle

| Percorso | Ruolo |
|---|---|
| `src/index.js` | Entry point: client, caricamento comandi/eventi, login, avvio dashboard condizionale |
| `src/commands/<categoria>/*.js` | Comandi slash (`data` + `execute` + `cooldown`); la categoria è il nome cartella (`ai`, `economy`, `fun`, `levels`, `moderation`, `music`, `tickets`, `utility`) |
| `src/events/*.js` | Un file per listener (`name` + `execute` + `once?`); vedi pattern multi-listener sotto |
| `src/handlers/` | `ticketHandler.js`, `reactionRoleHandler.js`: gestiscono select/modali/bottoni prima dei comandi |
| `src/database/` | `store.js` + `jsonDb.js` (infrastruttura) + ~25 moduli di dominio (`economy.js`, `levels.js`, …) + rispettivi `<nome>.json` |
| `src/dashboard/` | `server.js`, `auth.js`, `api.js`, `public/`: web app Express nello stesso processo |
| `src/jobs/` | `ticketAutoclose.js`, `backup.js`, `selfImprove.js`: timer avviati da `events/ready.js`, mai avviati altrove |
| `src/utils/` | `logger.js`, `i18n.js`, `ai.js`/`aiProviders.js`, `player.js`, `codebase.js`, `helpers.js`, `transcript.js`, … |
| `src/locales/` | `it.js`, `en.js` per `utils/i18n.js` |
| `scripts/smoke-test.js` | QA (`npm test`): comandi, eventi, roundtrip DB su chiavi `qatest`, require-safe |
| `scripts/gen-docs.js` | Genera `docs/COMMANDS.md` senza rete né bot |
| `deploy-commands.js` | Registra gli slash command su Discord (guild di test o globale) |

## Avvio (`src/index.js`)

1. `dotenv`, require di `DISCORD_TOKEN` (exit 1 se manca).
2. `Client` con 8 intent (`Guilds`, `GuildMessages`, `MessageContent`,
   `GuildMembers`, `GuildModeration`, `GuildMessageReactions`,
   `GuildVoiceStates`, `GuildInvites`) e partials (`Message`, `Channel`,
   `GuildMember`, `Reaction`).
3. `client.commands` / `client.cooldowns` (`Collection`), `client.spamMap`
   (`Map` anti-spam in memoria).
4. `loadCommands(src/commands)` **ricorsiva**: assegna
   `command.category = <nome cartella>`, ignora file senza `data`/`execute`
   con warning, segnala nomi slash duplicati senza sovrascrivere
   silenziosamente (l'ultimo vince nel `Collection`, con `console.warn`).
   Un `require` fallito salta solo quel file, mai tutto il bot.
5. Registrazione eventi: un `client.on`/`client.once` **per file**, con
   validazione (`name` stringa + `execute` funzione); file non validi
   saltati con warning.
6. Handler `unhandledRejection`/`uncaughtException`: log console + logger
   strutturato, mai crash.
7. `client.login(DISCORD_TOKEN)`, poi dashboard solo se `DASHBOARD_PORT`
   impostato, dentro try/catch (un fallimento non spegne il bot).

## Flusso interaction → comando (`src/events/interactionCreate.js`)

Ordine esatto della pipeline per ogni `InteractionCreate`:

1. **`ticketHandler.handle(interaction)`** — se consuma (select, modali,
   bottoni ticket), stop.
2. **`reactionRoleHandler.handle(interaction)`** — se consuma (select
   `rr_select`), stop. Entrambi con reply effimera di errore dedicata.
3. **Bottoni `nuke_*`** — `nuke_cancel` annulla; `nuke_confirm` richiede
   permesso `ManageChannels`, clona il canale, elimina l'originale e
   conferma (reply via webhook perché il canale originale non esiste più).
4. Solo `isChatInputCommand()` prosegue; comando cercato in
   `client.commands` per `interaction.commandName`.
5. **Permessi custom** (`database/customPerms`, stile PeakBot) — ruoli
   per-comando per guild, con bypass `Administrator`. Sta **prima** del
   cooldown di proposito: chi viene respinto non consuma attesa.
6. **Cooldown** per comando+utente (`command.cooldown || 3` secondi),
   con messaggio effimero di attesa in formato timestamp relativo.
7. `command.execute(interaction, client)` + `logCommand(...)` per le
   analytics. In caso di errore: log strutturato, embed best-effort nel
   `logChannelId` della guild (`database/guildConfig`), **rimborso del
   cooldown** (`timestamps.delete`) così un errore non fa pagare attesa,
   reply effimera generica.

## Pattern multi-listener (eventi)

`index.js` registra **un listener per file**, quindi più file sullo stesso
evento Discord sono più listener attivi — è un pattern **voluto** solo per
questi eventi (verificato dallo smoke test, corpi disgiunti):

- `guildMemberAdd` — welcome (`guildMemberAdd.js`), autorole
  (`autorole.js`), anti-raid (`antiRaid.js`), analytics joins
  (`analyticsMembers.js`), inviti (`inviteTracker.js`).
- `messageCreate` — XP/automod (`messageCreate.js`), autoresponder
  (`autoResponder.js`, solo lettura + reply), conteggio analytics
  (`analyticsMessages.js`).
- `voiceStateUpdate` — stanze vocali temporanee (`tempVoice.js`),
  XP vocale (`voiceXp.js`).

Qualsiasi altro evento duplicato su due file è un **errore** (lo smoke test
fallisce). Altri listener singoli notevoli: `aiMention.js`,
`aiModeration.js`, `auditLog.js`, `customCommands.js`, `starboard.js`,
`snipe` via `utils/snipeCache.js`, `ready.js`.

## Persistenza (`src/database/store.js` + `jsonDb.js`)

- `store.js` — API sincrona `collection(nome)` con `get/set/update/delete/all`.
  Backend da env a ogni operazione (i test cambiano env a runtime):
  - `DB_BACKEND=json` (**default**): file `src/database/<nome>.json`,
    read-modify-write atomico via tmp+rename; file corrotti copiati in
    `<file>.corrupt-<timestamp>` invece di perderli.
  - `DB_BACKEND=sqlite`: `node:sqlite` su `DB_SQLITE_PATH` (default
    `./data/bot.db`), tabella `kv(collection, key, value)` con valori
    JSON, `journal_mode=WAL`, transazioni su replace multi-riga; se il
    driver manca o l'apertura fallisce, fallback a json con warning
    (mai crash, mai perdita dati).
  - Postgres **futuro, non attivo**: solo schema in
    `src/database/postgres-schema.sql`; richiederebbe API async separata.
- `jsonDb.js` — compat layer `load/save/dbFile` sopra `store.js`, così i
  ~25 moduli di dominio (`economy`, `levels`, `warnings`, `guildConfig`,
  `tickets`, `cases`, `shop`, `lotteria`, `rep`, `sfide`, `confessioni`,
  `reactionRoles`, `autoresponder`, `invites`, `tempvoice`, `stanze`,
  `levelRewards`, `analytics`, `customPerms`, `customCommands`,
  `aiConfig`, `starboard`, …) funzionano invariati su entrambi i backend.

## Dashboard stesso-processo (`src/dashboard/`)

- Avviata da `index.js` solo se `DASHBOARD_PORT` è impostato; `express` è
  `require`d **lazy dentro `startDashboard()`** così lo smoke test passa
  anche senza express installato.
- Legge gli **stessi JSON DB del bot** (nessuna sincronizzazione).
- `server.js`: JSON limit 256kb, static `public/`, route auth, `/api`
  protetta da `auth.requireAuth`, landing con fallback inline se
  `public/index.html` manca, 404 JSON, error handler che non crasha mai.
- `auth.js`: OAuth2 Discord (redirect `<BASE_URL>/callback`, scope
  identify+guilds) con `SESSION_SECRET`, `CLIENT_ID`, `CLIENT_SECRET`,
  `BASE_URL`.
- `api.js`: API per-guild riservate agli admin dei server in comune.

## Job (`src/jobs/`, avviati da `src/events/ready.js`)

| Job | Schedulazione | Cosa fa |
|---|---|---|
| `ticketAutoclose` | ogni 15 min | Chiude ticket inattivi oltre `autoCloseDays` (`setAutoClose`, 0 = off, max 90) |
| `backup` | ogni notte ore 03:00 locali | Copia `src/database/*.json` (+ sqlite se esiste) in `backups/YYYY-MM-DD-HHmm/`, retention 7 giorni, journal `backups/last.json`; mai crashare |
| `selfImprove` | notturno `SELF_IMPROVE_TIME` | Attivo solo con `SELF_IMPROVE=1` (default off); rilegge il codice e propone **una** patch, mai commit automatici, `SELF_IMPROVE_DRY_RUN=1` per solo report |

Tutti usano interval con `unref` così non tengono vivo il processo da soli,
e ogni avvio è wrappato in try/catch in `ready.js`.

## Deploy comandi e i18n

- `deploy-commands.js` — scansiona `src/commands` (un livello), pusha
  `data.toJSON()` via REST: su guild di test se `GUILD_ID` impostato,
  altrimenti globale (fino a ~1h di propagazione).
- `utils/i18n.js` + `locales/it.js`/`en.js` — testi di risposta
  localizzati per guild (`getLang`/`t`); nomi e descrizioni slash restano
  in italiano.
- Musica (`utils/player.js`, comando `/musica`) — `discord-player` con
  extractor; errori di dipendenze vocali mappati in messaggi italiani,
  mai crash.
