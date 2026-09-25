# ADR-001: Commander come unico orchestratore

- Stato: accettato
- Data: 2026-09-25

## Contesto

Comandi, eventi, componenti e dashboard accedevano direttamente a registry e
database dei moduli. Ogni nuovo ingresso (es. dashboard estratta) avrebbe
dovuto reimplementare gate, timeout e breaker.

## Decisione

Tutto passa dal Commander (`src/modules/commander.js` + `packages/commander`):
esecuzione comandi, gate componenti, guard eventi, facciata dashboard
(list/health/toggle/dispatch config), `canRun` per gli eventi.

## Conseguenze

- Smoke test vieta i bypass (`[8/5]`): dashboard, /modulo, handler ed eventi
  non richiedono mai `modules/registry` diretto.
- Estrarre la dashboard un giorno = cambiare trasporto, non chiamate.
- I moduli restano isolati: mai chiamate tra moduli.
