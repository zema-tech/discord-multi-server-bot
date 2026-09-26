# Memory — modelli di note per il cervello del bot

Le **memorie vere** vivono in `./brain/memory/<server-id>/` (gitignored: sono
dati privati dei server, mai su GitHub). Questa cartella contiene solo
**modelli** pronti da istanziare + le convenzioni.

```
memory/
  README.md              ← questo file
  modelli/
    evento-ricorrente.md
    regole-serata.md
```

## Creare una nota da modello (staff, da Discord)

```
/brain memoria-modello modello:evento-ricorrente titolo:Trivia venerdì
```

La nota nasce nel brain del tuo server con il testo del modello (dove
completi i `__CAMPI__`). Poi la modifichi con `/brain memoria-salva` usando
lo stesso titolo (sovrascrive).

## Convenzioni delle note (stile Obsidian)

- Titolo 2-60 char, niente `README` (riservato).
- `[[Wikilink]]` per collegare note (`[[Trivia venerdì]]` linka la nota
  omonima; `/brain memoria-mostra` elenca anche i backlink).
- `#tag` nel testo o nel frontmatter per ritrovare le note
  (`/brain memoria-cerca` cerca in titoli, corpo e tag).
- Max 200 note e 2000 caratteri per nota e per server.

## Creare un modello per la libreria

File in `memory/modelli/<nome>.md` (nome 2-32 char `a-z 0-9 -`):

```md
---
title: Titolo di esempio
tags: esempio, modello
---
Testo con [[Link]] e __CAMPI__ da completare...
```

`title`/`tags` del frontmatter diventano titolo e tag della nota creata;
se il subcommand passa un `titolo` diverso, vince quello dell'utente.
