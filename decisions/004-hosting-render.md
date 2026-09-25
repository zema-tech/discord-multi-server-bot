# ADR-004: Hosting Render single-service + SQLite su disco

- Stato: accettato
- Data: 2026-09-25

## Contesto

Produzione su Render (non Termux: lì gira solo lo sviluppo). Piano free =
filesystem effimero + spin-down: JSON/SQLite si azzerano a ogni deploy e il
bot si spegne da inattivo. La community deve poter fare deploy one-click.

## Decisione

- Un solo Web Service Docker: `deploy-commands` → dashboard in background
  su `$PORT` → bot in foreground (già nel `CMD` del Dockerfile).
- `DB_BACKEND=sqlite` su disco persistente (`/app/data/bot.db` via
  `render.yaml` con Disk; il free tier richiede upgrade per il disco —
  documentato onestamente in `docs/HOSTING.md`).
- Blueprint `render.yaml` con healthcheck `/healthz` e secret generati.

## Conseguenze

- Trigger Postgres esterno: community numerosa su free tier che non può
  pagare il disco, oppure bisogno multi-istanza (sharding).
- Mai due istanze sullo stesso SQLite/JSON: corruzione garantita.
