# PLAN — Nuova dashboard Next.js (sostituisce Express+EJS)

> Stato: Fase 0 completata (analisi), Fase 1 scaffold in corso. La vecchia dashboard
> (`src/dashboard/`, Express + vanilla JS) resta attiva finché la Fase 3 non la dichiara deprecata.

## 0. Analisi del repo attuale (zema-tech/discord-multi-server-bot)

### Cosa fa la dashboard vecchia (`src/dashboard/`, ~3500 righe)

| File | Ruolo |
|---|---|
| `server.js` | Express standalone (`npm run dashboard`), CSP strict, rate-limit 120req/10min su `/api/*`, serve `public/` |
| `auth.js` | OAuth2 Discord **fatto a mano**: scope `identify guilds`, sessione in cookie firmato HMAC `pb_session = base64url(JSON).base64url(HMAC)` — niente lib di sessione |
| `api.js` (1367 righe) | Tutte le API per-guild, protette da `requireAuth` + check `ManageGuild` + bot presente nella guild |
| `guilds.js` / `discordRest.js` | Letture live da Discord via Bot token (canali, ruoli, member count) + roster `presence` scritto dal bot |
| `modules-extra.js` | Lettura/scrittura extra per moduli non coperti dallo schema base |
| `audit.js` | Audit trail delle modifiche |
| `public/` | Vanilla JS (7 file: core, home, panoramica, modules, lists, perms, icons) + `styles.css` (1400+ righe) |

### Contratto API esistente (da preservare in Fase 1)

```
GET  /api/me                                  → utente + guilds con bot (icone CDN)
GET  /api/guilds                              → lista server gestibili
GET  /api/guilds/:gid/meta                    → metadati + diagnostica
GET  /api/guilds/:gid/diag                    → diagnostica bot nel server
GET  /api/guilds/:gid                         → dettaglio: modules, lists, perms, controller, stats
GET  /api/guilds/:gid/schema                  → shape [{ module, title, fields[] }] per form dinamici
PUT  /api/guilds/:gid/modules/:mod             → toggle/salvataggio modulo (body variabile per modulo)
PUT  /api/guilds/:gid/perms                   → permessi custom { command, roleIds }
PUT  /api/guilds/:gid/modules/controller      → on/off feature { id, enabled } (via src/modules/registry)
```

### DB usati dalla dashboard (tutti sync, file JSON in `src/database/*.json`)

`guildConfig` (welcome/goodbye/log/automod), `autorole`, `tickets`, `tempvoice`,
`starboard`, `autoresponder`, `aiConfig`, `customCommands`, `customPerms`,
`confessioni`, `analytics` (conteggi gg), `levels`, `economy`, `levelRewards`,
`moduleState` (toggle feature), `registry.health()` per stato moduli.

### Vincolo critico

Lo store è **sincrono su filesystem locale** (`store.js`: `collection(nome)` con
`get/set/update/delete/all`, backend `json` default / `sqlite` opzionale). Su Vercel
il filesystem è effimero → la dashboard prod **richiede Postgres**. Strategia: adapter.

## 1. Riferimenti (verificati il 23/09/2026)

1. **SonMooSans/discord-bot-dashboard-2** (ora `fuma-nama`, archiviato; successore
   `discord-bot-dashboard-next`): il concetto da copiare è `src/config/features.tsx` —
   `'feature-id': { name, description, icon, useRender }` + tipologie in
   `custom-types.ts`. Contratto backend: `GET /auth`, `POST /auth/signout`,
   `GET /guilds/{guild}`, `GET/PATCH/POST/DELETE /guilds/{guild}/features/{feature}`,
   `GET /guilds/{guild}/roles`, `GET /guilds/{guild}/channels`.
2. **bromso/discord-bot-template**: l'architettura prod — monorepo Turborepo
   (`apps/bot`, `apps/dashboard`, `packages/config|db|i18n|logger|ui`), Postgres +
   Drizzle (`GuildSettings` jsonb), Auth.js v5 Discord provider, regola d'oro:
   **bot e dashboard scrivono solo via `updateGuildSettings()` in `@repo/db`**.
3. **powercore649/astra-bot**: il benchmark bellezza — `dashboard/` Next.js + Prisma
   + Postgres, landing/docs/status, 30+ temi, analytics con grafici, dark di default.

## 2. Architettura target

```
discord-multi-server-bot/
├── apps/
│   ├── bot/                  # FASE 2: symlink/puntatore a src/ esistente (logica invariata)
│   └── dashboard/            # NUOVO: Next.js 16 App Router + Auth.js v5 + Tailwind v4 + shadcn
├── packages/
│   ├── db/                   # NUOVO: adapter condiviso (fase 1: file-store, fase 2: Drizzle+Postgres)
│   ├── config/               # NUOVO: env validato con Zod (single source of truth)
│   └── ui/                   # NUOVO: componenti shadcn condivisi + globals.css
├── src/                      # INVARIATO: bot discord.js (86 comandi, Commander, jobs)
└── turbo.json                # NUOVO: orchestrazione dev/build/test
```

### packages/db — l'adapter (compatibilità garantita)

- **Fase 1 (ora)**: `fileAdapter` che delega ai moduli esistenti
  (`STORE_DIR=./src/database`). Stessi dati, zero migrazione, dev locale senza Docker.
- **Fase 2**: schema Drizzle `guild_settings` (jsonb per feature, come bromso) +
  script `import-json.ts` che migra tutti i `*.json` → Postgres. Le query
  (`getGuildSettings`, `updateGuildSettings`, `getAnalytics`, …) mantengono la
  **stessa firma** → bot e dashboard non cambiano codice, cambia solo l'adapter
  via `DB_ADAPTER=file|postgres`.

### Auth (Auth.js v5, Discord provider)

Scope `identify guilds`. La sessione conserva `access_token` (come oggi `pb_session`).
Helper `getManageableGuilds()`: guilds utente ∩ guilds del bot, filtro permesso
`MANAGE_GUILD (0x20)`. Route `/dashboard/[guildId]` con guard: 403 se non gestibile
o bot assente — identica semantica di `loadAccess` attuale.

## 3. Design system (deve battere MEE6/Carl.gg)

- Solo shadcn/ui + Tailwind v4. Niente Bootstrap. Font **Inter + Sora** (titoli).
- Dark default + toggle Light/Dark (`next-themes`, come Astra).
- Layout: sidebar icone (Overview, Moderazione, Welcome, Livelli, Ticket, Log, Impostazioni),
  topbar con profilo + selettore server stile Discord, main con cards.
- Glassmorphism (sidebar/topbar), gradient-border su card attive, framer-motion leggera,
  grafici Recharts (attività settimanale da `analytics.getDays`).
- `config/dashboard.config.ts`: `features: { welcome, autoRole, moderation, leveling, logs }`,
  ogni feature `{ name, description, icon, enabled, options: Option[] }` con
  `Option = string | boolean | channel_select | role_select | message_embed_builder`.
  Form auto-generato + **preview live** dell'embed stile Discord.

## 4. Fasi

- [x] **Fase 0** — analisi (questo file, §0) + verifica riferimenti (§1).
- [~] **Fase 1** — scaffold monorepo: `turbo.json`, `packages/config`, `packages/db`
  (file-adapter), `packages/ui`, `apps/dashboard` (landing, /servers,
  /dashboard/[guildId] overview + feature dinamiche, route handlers che specchiano
  il contratto §0, `.env.example`, README con `bun install`/`bun run dev`).
- [ ] **Fase 2** — `apps/bot` come workspace (re-export di `src/`), Drizzle schema +
  migrazione JSON→Postgres, Docker compose, deploy Railway/Fly.
- [ ] **Fase 3** — cutover: la Next.js diventa la dashboard ufficiale,
  `src/dashboard` deprecata (mai cancellata prima di 1 release di overlap).

## 5. Mappa feature → moduli esistenti (per `dashboard.config.ts`)

| Feature | Sorgente verità (oggi) | Option chiave |
|---|---|---|
| `welcome` | `guildConfig` (welcome/goodbye) | `channel_select` + `string` (con `{user}` `{server}`) |
| `autoRole` | `autorole` | `role_select[]` + `number` (ritardo) |
| `moderation` | `guildConfig.automod` + `customPerms` | `boolean` per regola + soglie |
| `leveling` | `levelRewards` + `levels` | `role_select` per livello + `number` XP |
| `logs` | `guildConfig.logChannelId` | `channel_select` |

## 6. Env (vedi `apps/dashboard/.env.example`)

`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXTAUTH_SECRET` (=`AUTH_SECRET`),
`DATABASE_URL` (fase 2, opzionale in fase 1), `BOT_TOKEN`, `STORE_DIR`,
`NEXT_PUBLIC_BOT_INVITE_URL`.
