# Hosting — discord-multi-server-bot

Guida in italiano per avviare il bot ovunque. Via rapida per tutti:

```bash
npm run setup   # rileva l'host, verifica il token live, scrive .env
npm run deploy  # registra gli slash command
npm start       # bot (+ dashboard con npm run dashboard)
```

Requisiti comuni:

- **Node.js ≥ 18** (consigliato **Node 20**), `npm`
- File `.env` creato da `.env.example` con almeno `DISCORD_TOKEN` e `CLIENT_ID`
- Deploy degli slash command: `npm run deploy` (dopo ogni aggiunta/modifica di comandi)
- Start: `npm start` (= `node src/index.js`) · Test: `npm test`

## Matrice host (rilevata in automatico da `src/host/`)

| Host | Disco | Storage consigliato | Dashboard | Note |
|------|-------|---------------------|-----------|------|
| Render | effimero | sqlite su Disk (`/app/data`) | ✅ via `$PORT` | Blueprint `render.yaml` |
| Railway | effimero | sqlite su Volume | ✅ via `$PORT` | Come Render |
| Pterodactyl | persistente | sqlite | ✅ porta pannello | Egg NodeJS generico |
| Docker | effimero* | sqlite su volume | ✅ `$PORT`/`3000` | `docker-compose.yml` (*persistente con volume) |
| VPS / locale | persistente | sqlite (Node 22+) o json | ✅ | PM2 consigliato |
| Termux | persistente | json | ✅ | Sviluppo, non produzione |
| Replit | persistente | json | ✅ | Sempre-on a pagamento |

> **Persistenza dati:** di default il bot usa JSON in `src/database/*.json`
> (`DB_BACKEND=json`). Per hosting con filesystem effimero (Railway/Render/Docker)
> usa invece SQLite: `DB_BACKEND=sqlite` + `DB_SQLITE_PATH=./data/bot.db`
> (richiede **Node ≥ 22**, usa `node:sqlite`, zero dipendenze extra),
> con la cartella `data/` su volume/disco persistente.

---

## 1. Termux (Android)

```bash
pkg update && pkg install -y nodejs git
git clone <repo> discord-bot && cd discord-bot
npm ci
cp .env.example .env   # poi compila con il tuo editor
npm run deploy
npm start
```

Note Termux:

- Niente systemd: per tenerlo attivo usa `termux-wake-lock` + sessione `tmux`,
  oppure PM2 (`npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save`).
  PM2 non riparte da solo al riavvio del telefono: riapri Termux e fai `pm2 resurrect`.
- Su Termux resta su `DB_BACKEND=json` (default) a meno di avere Node ≥ 22.
- I log vanno in `logs/YYYY-MM-DD.log` (`LOG_LEVEL=info` di default).

## 2. VPS (Debian/Ubuntu) — systemd oppure PM2

```bash
# Node 20 LTS (nodesource) + clone
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
git clone <repo> /opt/discord-bot && cd /opt/discord-bot
npm ci --omit=dev
cp .env.example .env   # compila DISCORD_TOKEN, CLIENT_ID, ...
npm run deploy
```

### Opzione A: systemd (consigliato)

```bash
sudo cp discord-bot.service /etc/systemd/system/discord-bot.service
# adatta User/percorsi nel file se non usi utente "bot" o /opt/discord-bot
sudo systemctl daemon-reload
sudo systemctl enable --now discord-bot
systemctl status discord-bot
journalctl -u discord-bot -f   # log live
```

Il file `discord-bot.service` usa `WorkingDirectory=/opt/discord-bot`,
`EnvironmentFile=/opt/discord-bot/.env` e `Restart=always`.

### Opzione B: PM2

```bash
sudo npm i -g pm2
pm2 start ecosystem.config.js   # fork, 1 istanza, log in logs/pm2-*.log
pm2 save && pm2 startup         # riavvio automatico al boot
pm2 logs discord-bot
```

> Una sola istanza mi raccomando (`fork`, mai `cluster`): il bot usa DB su file,
> due istanze scriverebbero gli stessi JSON/SQLite e corromperebbero i dati.

## 3. Docker

```bash
cp .env.example .env   # compila i valori
docker compose up -d --build
docker compose logs -f

# Con dashboard web (profilo opzionale, richiede DASHBOARD_* nel .env):
docker compose --profile dashboard up -d --build
```

- `Dockerfile`: base `node:20-slim`, `npm ci --omit=dev`, utente non-root `node`,
  `NODE_ENV=production`, volumi `/app/data /app/logs /app/backups`.
- `docker-compose.yml`: servizio `bot` (`restart: unless-stopped`, `env_file: .env`,
  volumi `./data ./logs ./backups`); servizio `bot-dashboard` (solo profilo
  `dashboard`) con porta `${DASHBOARD_PORT:-3000}` pubblicata.
- **Healthcheck condizionale** (vedi commento nel Dockerfile): senza `DASHBOARD_PORT`
  il bot non espone HTTP, quindi l'healthcheck ritorna subito sano
  (i crash li copre `restart: unless-stopped`); con dashboard attiva fa
  `GET /healthz` (endpoint pubblico con fallback a `/`) via `node -e ... fetch(...)`
  senza bisogno di `curl` nell'immagine.
- In container imposta `DB_BACKEND=sqlite` + `DB_SQLITE_PATH=./data/bot.db`
  (il compose lo fa già di default): i JSON di `src/database/` **non** sono
  montati come volume perché convivono con i moduli `.js` (montare la cartella
  nasconderebbe il codice al container).
- Musica: l'immagine `node:20-slim` **non** include `ffmpeg` (serve a
  `discord-player`/`@discordjs/voice`). Se usi i comandi musicali, aggiungi
  nel Dockerfile prima di `USER node`:
  `RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*`.

## 4. Railway / Render

**Via rapida (Render):** il repo include `render.yaml` (Docker + healthcheck
`/healthz` + disco da 1GB): *New → Blueprint*, poi compila le env segrete
(`DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET`, `BASE_URL`). Il blueprint
punta già SQLite su disco (`DB_SQLITE_PATH=/app/data/bot.db`).

Procedura manuale (valida per entrambi, filesystem effimero: serve disco persistente):

1. Crea il servizio dal repo (Build: `npm ci`, Start: `node src/index.js`).
2. Imposta le **Environment Variables** dal pannello (copia le chiavi di
   `.env.example`): `DISCORD_TOKEN`, `CLIENT_ID`, `DB_BACKEND=sqlite`,
   `DB_SQLITE_PATH=./data/bot.db`, ed eventualmente `DASHBOARD_*`
   (su Render apri anche la porta con `DASHBOARD_PORT`).
3. Monta un **disco persistente** sul percorso `data/` (es. Railway Volume →
   mount `/app/data`; Render Disk su runtime Docker → mount `/app/data`,
   su runtime Node nativo → `/opt/render/project/src/data`):
   lì vivono `bot.db`, `logs/` e `backups/`. Senza disco, a ogni deploy
   riparti da zero (economia, livelli, ticket… persi).
4. Esegui `npm run deploy` una volta (da locale con le stesse env, oppure
   come *one-off job*): registra gli slash command su Discord.
5. Render free: lo spin-down per inattività **spegne il bot** (il bot deve stare
   sempre online) — serve istanza sempre attiva o un piano a pagamento.

## 5. Pterodactyl — nota egg

Nessun egg ufficiale: usa un egg generico **NodeJS** (versione 20):

- **Startup Command:** `node src/index.js`
- **Install Script:** `npm ci` (o `npm ci --omit=dev`)
- **Environment / Variables:** `DISCORD_TOKEN`, `CLIENT_ID` (+ `DB_BACKEND`,
  `AI_*`, `DASHBOARD_*` se servono) — oppure monta/carica un file `.env`
  nella root del server.
- I dati restano sul disco del server Pterodactyl (persistenti tra i riavvii);
  fai backup regolari di `src/database/*.json` (o di `data/bot.db` se usi
  SQLite) con il comando `/backup` o dal pannello.
- Il deploy comandi (`node deploy-commands.js`) va lanciato una volta da
  console dopo aver impostato le variabili.

---

## Troubleshooting

| Sintomo | Causa probabile e fix |
|---|---|
| `DisallowedIntents` / bot online ma non risponde | Abilita nel [Developer Portal](https://discord.com/developers/applications) → Bot → **Privileged Gateway Intents**: **Server Members Intent** e **Message Content Intent** (il bot usa `GuildMembers` + `MessageContent`, vedi `src/index.js`). `GuildPresences` **non** serve. |
| Slash command mancanti o vecchi | Lancia `npm run deploy` (serve `CLIENT_ID`; con `GUILD_ID` i comandi arrivano subito sul server di test, senza devi attendere fino a ~1h per la propagazione globale). |
| `TokenInvalid` / `TOKEN_INVALID` | `DISCORD_TOKEN` errato o rigenerato: aggiorna `.env` (mai committarlo) e riavvia. |
| Bot non ha effetto (ruoli, timeout, canali) | **Permessi**: invita il bot con scope `bot` + `applications.commands` e permessi adeguati (Gestire ruoli/canali, Bannare, Moderare membri per i timeout, Connettersi/Parlare per la musica). Il **ruolo del bot deve stare sopra** i ruoli che deve gestire, altrimenti Discord rifiuta in silenzio. |
| Dashboard: redirect OAuth fallito | `BASE_URL` deve corrispondere al Redirect URI registrato nel portale Discord (`<BASE_URL>/callback`, scope `identify`+`guilds`); servono anche `CLIENT_SECRET` e `SESSION_SECRET` (≥32 caratteri). |
| Porta occupata / dashboard non apre | Cambia `DASHBOARD_PORT` nel `.env`; verifica che la porta sia esposta (firewall/VPS, `ports:` nel compose, porta aperta su Render). |
| Musica che non parte / errori voice | Servono `ffmpeg` e dipendenze `libsodium`/`opus` (su VPS: `apt install ffmpeg`; su Docker vedi §3). Senza, gli altri comandi funzionano comunque. |
| DB azzerato dopo un redeploy | Filesystem effimero senza volume: passa a `DB_BACKEND=sqlite` con `data/` persistente (§4). In locale fai `/backup` regolari (finiscono in `backups/`). |
| Crash loop / restart continui | Leggi `logs/YYYY-MM-DD.log` (o `journalctl`/`pm2 logs`/`docker compose logs`): quasi sempre è `.env` incompleto (`DISCORD_TOKEN` mancante → exit 1 immediato). |
