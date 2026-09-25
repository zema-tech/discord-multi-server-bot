# Contribuire

Bot open-source (MIT) per la community: ogni PR viene letta e riceve una
risposta vera. Poche regole, rispettate sempre.

## Gate (obbligatorio prima di aprire la PR)

```bash
npm run verify   # tsc (packages/commander) + smoke test completo
```

Rosso in CI = informazione, non bocciatura: fixa e ripusha.

## Convenzioni

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- **Mai** force-push, `reset --hard`, `branch -D` senza averlo chiesto.
- **Mai** secret nei commit (token, chiavi API, sessioni). Solo `.env` locale.
- Funzioni sotto le 50 righe; test insieme al codice (sezione smoke `scripts/smoke-test.js`).
- Italiano per i messaggi utente del bot; codice e commenti concisi.

## Architettura (da rispettare)

- **Commander unico orchestratore** (`src/modules/commander.js`): dashboard,
  comandi, eventi e handler non richiedono mai `modules/registry` diretto —
  lo smoke `[8/5]` lo vieta e fallisce se lo fai.
- **Moduli isolati**: descrittore in `src/modules/<id>.js` via `defineModule`,
  mai chiamate tra moduli.
- **DB**: JSON con `schema.js` versionato (`__v`); niente nuove dipendenze
  senza necessità di correttezza.
- Vedi `decisions/` (ADR) per le scelte già prese e i loro trigger.

## Issue utili

Una riproduzione minima è già un contributo ottimo. Per le idee nuove apri
prima una issue: decidiamo insieme *prima* che tu spenda un weekend a costruirle.
