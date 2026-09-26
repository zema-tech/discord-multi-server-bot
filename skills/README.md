# Skills — libreria curata per il cervello del bot

Skill pronte all'uso nello stesso formato del brain (`src/ai/brain/skills.js`):
markdown con frontmatter `name` / `description` / `triggers` / `enabled` +
istruzioni per l'AI (max 2000 caratteri).

```
skills/
  README.md              ← questo file
  sintesi-serale.md
  consiglio-film-serie.md
  aiuto-compiti.md
  promemoria-gentile.md
```

## Installare una skill (staff, da Discord)

```
/brain skill-importa nome:sintesi-serale
```

Copia la skill del repo nel tuo server (scope server: puoi modificarla o
disattivarla senza toccare gli altri server). `/brain skill-lista` per
verificare, `/brain skill-toggle` per accenderla/spegnerla.

In alternativa a mano: copia il file in `brain/skills/global/<nome>.md`
(tutti i server del bot) oppure creala da zero con `/brain skill-crea`.

## Creare una skill per la libreria

1. Nome file = nome skill: 2-32 char `a-z 0-9 -` (es. `mia-skill.md`).
2. Frontmatter in testa, poi le istruzioni:

```md
---
name: mia-skill
description: Cosa fa, in una riga (max 200)
triggers: parola1, parola2, frase chiave
enabled: true
---
Istruzioni per l'AI: tono, cosa fare, cosa evitare...
```

3. Trigger efficaci: parole che gli utenti scrivono davvero (verbi comuni,
   sinonimi, niente gergo interno). Max ~20, separati da virgola.
4. Istruzioni brevi e concrete: cosa fare in 2-3 punti, tono, un limite
   esplicito ("mai...", "solo..."). L'AI le riceve quando i trigger matchano.

Le skill della libreria sono solo modelli: una volta importate vivono nel
brain del server (`brain/` è gitignored, sono dati privati).
