# ADR-002: JSON versionato invece di Postgres

- Stato: accettato
- Data: 2026-09-25

## Contesto

Ispirazione Lumi/Lucky (Postgres + Prisma). Il bot gira single-process
(spesso su Termux), con decine — non migliaia — di guild. Postgres/Redis
aggiungerebbero dipendenze e modi di rompersi senza un bisogno misurato.

## Decisione

Restare su JSON con disciplina da database serio:
scritture atomiche tmp+rename (già in `jsonDb.js`), schema versionato con
`migrate()` formali e timbro `__v` (`schema.js`), back-end sqlite opzionale
già previsto da `store.js`.

## Conseguenze

- Trigger di rivalutazione: un file sopra ~5MB, scansioni leaderboard lente,
  o bisogno reale di multi-processo/sharding.
- In quel caso: pilota SQLite su UN solo store, mai rewrite totale.
