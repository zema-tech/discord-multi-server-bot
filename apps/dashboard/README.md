# Dashboard — Multi-Server Bot (Next.js)

Nuova dashboard (Next.js 16 App Router + Auth.js v5 + Tailwind v4 + shadcn).
Sostituisce `src/dashboard` (Express) al completamento della Fase 3 — vedi `/PLAN.md`.

## Prerequisiti

- [Bun](https://bun.sh) 1.1+
- Discord OAuth app con redirect `http://localhost:3000/api/auth/callback/discord`
- (Fase 1) Nessun DB: legge gli stessi JSON del bot via `STORE_DIR`

## Setup

```bash
bun install
cp apps/dashboard/.env.example apps/dashboard/.env   # riempi DISCORD_CLIENT_ID/SECRET, NEXTAUTH_SECRET, BOT_TOKEN
bun run dev --filter dashboard                        # http://localhost:3000
```

Comandi dalla root (Turborepo):

```bash
bun install        # installa tutti i workspace
bun run dev        # bot (esistente) + dashboard in parallelo — Fase 2
bun run build
bun run check-types
```

## Struttura

```
apps/dashboard/
├── app/
│   ├── page.tsx                          # landing
│   ├── servers/page.tsx                  # server con MANAGE_GUILD + bot dentro
│   ├── dashboard/[guildId]/page.tsx      # overview: stats + Recharts
│   ├── dashboard/[guildId]/[feature]/    # form auto-generato + preview live
│   └── api/guilds/[id]/settings/         # route handler (specchio API Express)
├── config/dashboard.config.ts            # features/options — aggiungi qui le feature
├── components/                           # dynamic-form, embed-preview, activity-chart
└── lib/                                  # auth (Auth.js+Discord), guilds guard, discord-rest
packages/
├── db/        # query condivise (fase 1: file-adapter su STORE_DIR)
├── config/    # env Zod
└── ui/        # Button/Card/Switch shadcn-style
```

## Aggiungere una feature

1. Voce in `config/dashboard.config.ts` (`options: Option[]`).
2. (Se serve) mapping in `packages/db/src/index.ts` (`FEATURE_STORE`).
3. La pagina `/dashboard/[guildId]/<id>` esiste già da sola.

## Fase 2 (Postgres)

```bash
docker compose up -d --wait
bun run db:migrate        # con drizzle-kit, da packages/db
DB_ADAPTER=postgres bun run dev
```

Con `DB_ADAPTER=file` (default) funziona tutto senza Docker.
