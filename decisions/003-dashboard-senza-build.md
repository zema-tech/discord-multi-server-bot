# ADR-003: Dashboard senza build, contratto endpoint

- Stato: accettato
- Data: 2026-09-25

## Contesto

Tentazione React/Vite/shadcn (Lucky). Ma il bot non ha build step e gira su
host minimi: una build rotta = dashboard morta senza errori chiari.

## Decisione

Frontend vanilla (HTML/CSS/JS) servito da Express, design token a 3 strati,
Chart.js via CDN con fallback. Il contratto endpoint è blindato dallo smoke
test: la FE può chiamare solo gli endpoint consentiti.

## Conseguenze

- Zero dipendenze di build, deploy = copia file.
- Se un giorno serve React: solo dopo aver introdotto un build verificato in CI.
