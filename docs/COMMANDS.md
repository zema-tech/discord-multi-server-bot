# Comandi del bot

> Generato automaticamente con `node scripts/gen-docs.js` il 2026-09-18 — non modificare a mano.
>
> Totale: **85 comandi** in **8 categorie**.
> La categoria corrisponde alla sottocartella in src/commands/.
> Cooldown in secondi per utente (default 3 s se non specificato nel modulo).
> I parametri marcati con asterisco (*) sono obbligatori.

## Indice categorie

- [ai](#ai) (8)
- [economy](#economy) (11)
- [fun](#fun) (13)
- [levels](#levels) (3)
- [moderation](#moderation) (13)
- [music](#music) (1)
- [tickets](#tickets) (2)
- [utility](#utility) (34)

## ai

Comandi: 8

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/ai-config` | Configura le funzioni AI del server | 3 s | **mostra** — Mostra la configurazione AI attuale (nessun parametro)<br>**mention** — Risposta automatica quando il bot viene menzionato (`stato: booleano*`)<br>**automod-ai** — Analisi AI dei messaggi sospetti (automod) (`stato: booleano*`)<br>**ticket-ai** — Risposte AI automatiche nei ticket (`stato: booleano*`)<br>**fun-ai** — Comandi fun AI (/immagina, /storia) (`stato: booleano*`)<br>**prompt** — Imposta il prompt di sistema personalizzato (`testo: stringa*`)<br>**prompt-reset** — Ripristina il prompt di sistema di default (nessun parametro) |
| `/analizza` | Chiedi all’AI 5 insight azionabili per far crescere il server | 30 s | `giorni: intero` |
| `/brain` | Il cervello del bot: skill, memorie e file (stile Obsidian) | 5 s | **stato** — Statistiche del cervello del server (nessun parametro)<br>**skill-lista** — Elenca le skill attive (nessun parametro)<br>**skill-mostra** — Mostra una skill (`nome: stringa*`)<br>**skill-crea** — Crea una skill (staff) (`nome: stringa*`, `descrizione: stringa*`, `trigger: stringa*`, `istruzioni: stringa*`)<br>**skill-toggle** — Attiva/disattiva una skill (staff) (`nome: stringa*`, `stato: booleano*`)<br>**skill-rimuovi** — Elimina una skill del server (staff) (`nome: stringa*`)<br>**memoria-salva** — Salva una nota nel cervello (staff) (`titolo: stringa*`, `testo: stringa*`, `tag: stringa`)<br>**memoria-cerca** — Cerca nelle memorie (`query: stringa*`)<br>**memoria-lista** — Elenca le note (nessun parametro)<br>**memoria-mostra** — Mostra una nota (staff) (`titolo: stringa*`)<br>**memoria-dimentica** — Elimina una nota (staff) (`titolo: stringa*`)<br>**file-aggiungi** — Carica un file di riferimento .txt/.md (staff) (`nome: stringa*`, `allegato: allegato*`)<br>**file-lista** — Elenca i file caricati (nessun parametro)<br>**file-leggi** — Leggi un file (staff) (`nome: stringa*`)<br>**file-rimuovi** — Elimina un file (staff) (`nome: stringa*`) |
| `/chiedi` | Fai una domanda all’AI del server | 15 s | `domanda: stringa*` |
| `/codice` | Chiedi all’AI cose sul codice del bot | 10 s | **chiedi** — Fai una domanda sul codice del bot (`domanda: stringa*`)<br>**file** — Mostra un file del bot (prime righe) (`percorso: stringa*`)<br>**cerca** — Cerca un termine nel codice (`termine: stringa*`)<br>**albero** — Panoramica della struttura del codice (nessun parametro) |
| `/immagina` | Genera un’immagine con l’AI dal tuo prompt | 20 s | `prompt: stringa*` |
| `/riassumi` | Riassume gli ultimi messaggi del canale con l’AI | 30 s | `quantita: intero` |
| `/storia` | Genera un racconto originale con l’AI | 20 s | `tema: stringa*`, `lunghezza: stringa` |

## economy

Comandi: 11

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/balance` | Vedi il tuo saldo o quello di un altro utente | 3 s | `utente: utente` |
| `/bank` | Gestisci la banca (al sicuro dai furti) | 3 s | **deposita** — Deposita monete in banca (`importo: intero*`)<br>**preleva** — Preleva monete dalla banca (`importo: intero*`) |
| `/daily` | Ritira la ricompensa giornaliera (500 🪙) | 5 s | — |
| `/leaderboard` | Classifica dei più ricchi del server | 5 s | — |
| `/lotteria` | Lotteria del server: compra biglietti e vinci il piatto! | 3 s | **info** — Mostra piatto, prezzo e biglietti venduti (nessun parametro)<br>**compra** — Compra biglietti della lotteria (`biglietti: intero`)<br>**estrai** — Estrai subito il vincitore (staff) (nessun parametro) |
| `/pay` | Invia monete a un altro utente | 5 s | `utente: utente*`, `importo: intero*` |
| `/rep` | Sistema di reputazione del server | 3 s | **dai** — Dai +1 rep a un utente (`utente: utente*`)<br>**mostra** — Mostra le rep di un utente (`utente: utente`)<br>**classifica** — Top 10 utenti con più rep (nessun parametro) |
| `/rob` | Tenta di rubare monete (solo portafoglio) a un utente | 10 s | `utente: utente*` |
| `/shop` | Negozio ruoli del server | 3 s | **lista** — Mostra i ruoli in vendita (nessun parametro)<br>**compra** — Compra un ruolo con le tue monete (`ruolo: ruolo*`)<br>**aggiungi** — Metti un ruolo in vendita (staff) (`ruolo: ruolo*`, `prezzo: intero*`)<br>**rimuovi** — Togli un ruolo dalla vendita (staff) (`ruolo: ruolo*`) |
| `/slots` | Slot machine: scommetti le tue monete | 8 s | `puntata: intero*` |
| `/work` | Lavora per guadagnare monete | 5 s | — |

## fun

Comandi: 13

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/8ball` | Chiedi qualcosa alla palla magica 8 | 3 s | `domanda: stringa*` |
| `/affinita` | Calcola l'affinità (ironica) tra due utenti | 3 s | `utente1: utente*`, `utente2: utente` |
| `/animale` | Foto casuale di un gatto o di un cane! 🐾 | 5 s | `tipo: stringa*` |
| `/coinflip` | Lancia una moneta (testa o croce) | 2 s | — |
| `/confessa` | Confessioni anonime del server | 5 s | **imposta** — Imposta il canale dove pubblicare le confessioni anonime (staff) (`canale: canale*`)<br>**invia** — Invia una confessione anonima (max 500 caratteri) (`testo: stringa*`) |
| `/dice` | Lancia uno o più dadi | 3 s | `facce: intero`, `quantita: intero` |
| `/joke` | Racconta una barzelletta | 3 s | — |
| `/meme` | Genera un meme casuale | 3 s | — |
| `/oroscopo` | Scopri il tuo oroscopo di oggi: amore, lavoro e fortuna! | 3 s | `segno: stringa*` |
| `/preferiresti` | Un dilemma impossibile: vota A o B e scopri cosa pensa il server! | 10 s | — |
| `/rps` | Carta, forbici, sasso contro il bot | 3 s | `scelta: stringa*` |
| `/sfida` | Mostra la sfida settimanale del server | 5 s | — |
| `/trivia` | Quiz a scelta multipla: indovina la risposta entro 20 secondi! | 10 s | — |

## levels

Comandi: 3

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/premi` | Gestisci i ruoli premio per i livelli | 3 s | **imposta** — Assegna un ruolo a un livello (`livello: intero*`, `ruolo: ruolo*`)<br>**rimuovi** — Rimuovi il premio di un livello (`livello: intero*`)<br>**lista** — Mostra tutti i premi livello (nessun parametro) |
| `/rank` | Mostra il tuo livello (o quello di un altro utente) | 3 s | `utente: utente` |
| `/top` | Classifica livelli del server | 5 s | — |

## moderation

Comandi: 13

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/ban` | Banna un utente dal server | 5 s | `utente: utente*`, `motivo: stringa`, `giorni: intero` |
| `/caso` | Storico moderazione del server | 3 s | **vedi** — Vedi un caso tramite ID (`id: stringa*`)<br>**utente** — Vedi lo storico di un utente (`utente: utente*`, `tipo: stringa`)<br>**nota** — Aggiungi una nota allo storico di un utente (`utente: utente*`, `testo: stringa*`)<br>**elimina** — Elimina un caso dallo storico (ManageGuild) (`id: stringa*`) |
| `/clear` | Cancella messaggi (max 100, solo ultimi 14 giorni) | 5 s | `quantita: intero*`, `utente: utente` |
| `/kick` | Espelli un utente dal server | 5 s | `utente: utente*`, `motivo: stringa` |
| `/lock` | Blocca/sblocca un canale testuale | 3 s | **on** — Blocca il canale (solo staff può scrivere) (nessun parametro)<br>**off** — Sblocca il canale (nessun parametro) |
| `/lockdown` | Blocca/sblocca TUTTI i canali testuali (emergenza raid) | 10 s | **on** — Blocca tutti i canali testuali (@everyone non può scrivere) (`motivo: stringa`)<br>**off** — Ripristina i permessi precedenti al lockdown (nessun parametro) |
| `/nuke` | Rigenera il canale (clona + elimina il vecchio) | 10 s | — |
| `/slowmode` | Imposta lo slowmode di un canale | 3 s | `secondi: intero*`, `canale: canale` |
| `/timeout` | Mette un utente in timeout (es. 10m, 1h, 1d) | 5 s | `utente: utente*`, `durata: stringa*`, `motivo: stringa` |
| `/unban` | Sbanna un utente tramite ID | 5 s | `userid: stringa*`, `motivo: stringa` |
| `/untimeout` | Rimuove il timeout da un utente | 3 s | `utente: utente*`, `motivo: stringa` |
| `/warn` | Avvisa un utente (3 warn = timeout automatico 10m) | 3 s | `utente: utente*`, `motivo: stringa*` |
| `/warnings` | Gestisci gli avvisi di un utente | 3 s | **lista** — Vedi gli avvisi di un utente (`utente: utente*`)<br>**rimuovi** — Rimuovi un singolo warn tramite ID (`utente: utente*`, `id: stringa*`)<br>**pulisci** — Rimuovi tutti i warn di un utente (`utente: utente*`) |

## music

Comandi: 1

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/musica` | Riproduci musica nel canale vocale (stile PeakBot) | 3 s | **play** — Riproduci un brano o aggiungilo in coda (`query: stringa*`)<br>**skip** — Salta il brano corrente (nessun parametro)<br>**stop** — Ferma la musica e svuota la coda (nessun parametro)<br>**coda** — Mostra la coda di riproduzione (nessun parametro)<br>**pausa** — Mette in pausa il brano corrente (nessun parametro)<br>**riprendi** — Riprende il brano in pausa (nessun parametro)<br>**volume** — Imposta il volume (0-100) (`livello: intero*`)<br>**attuale** — Mostra il brano in riproduzione (nessun parametro) |

## tickets

Comandi: 2

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/ticket` | Sistema ticket professionale | 3 s | **setup** — Configura il sistema ticket (categoria, panel, log, ruoli) (`canale-panel: canale*`, `categoria: canale*`, `ruolo-supporto: ruolo*`, `canale-log: canale`, `ruolo-supporto-2: ruolo`, `max-per-utente: intero`)<br>**panel** — Ripubblica il pannello ticket (nessun parametro)<br>**aggiungi** — Aggiungi un utente al ticket (`utente: utente*`)<br>**rimuovi** — Rimuovi un utente dal ticket (`utente: utente*`)<br>**claim** — Prendi in carico questo ticket (staff) (nessun parametro)<br>**chiudi** — Chiudi questo ticket con transcript (`motivo: stringa`)<br>**riapri** — Riapri questo ticket (staff) (nessun parametro)<br>**transcript** — Scarica il transcript di questo ticket (nessun parametro)<br>**stats** — Statistiche dei ticket del server (nessun parametro) |
| `/ticket-ai` | Assistente AI per i ticket (bozze e riassunti) | 10 s | **suggerisci** — Genera una bozza di risposta staff per questo ticket (nessun parametro)<br>**riassumi** — Riassume questo ticket in 5 punti (nessun parametro) |

## utility

Comandi: 34

| Comando | Descrizione | Cooldown | Sottocomandi / Opzioni |
|---|---|---|---|
| `/analytics` | Statistiche del server stile YouTube-Studio (messaggi e membri) | 10 s | `giorni: intero` |
| `/autoresponder` | Risposte automatiche a parole chiave o regex (stile PeakBot) | 3 s | **aggiungi** — Aggiungi una risposta automatica (`parola: stringa*`, `risposta: stringa*`, `modalita: stringa`)<br>**rimuovi** — Rimuovi una risposta automatica tramite ID (`id: stringa*`)<br>**lista** — Mostra tutte le risposte automatiche (nessun parametro)<br>**pulisci** — Elimina tutte le risposte automatiche (nessun parametro) |
| `/autorole` | Gestisci i ruoli assegnati automaticamente ai nuovi membri | 3 s | **aggiungi** — Aggiungi un ruolo automatico per i nuovi membri (`ruolo: ruolo*`)<br>**rimuovi** — Rimuovi un ruolo automatico (`ruolo: ruolo*`)<br>**lista** — Mostra lo stato attuale dell'autorole (nessun parametro)<br>**attiva** — Attiva o disattiva l'autorole (`stato: booleano*`) |
| `/avatar` | Mostra l'avatar di un utente | 3 s | `utente: utente` |
| `/comando` | Custom commands del server: trigger !nome con risposta personalizzata (stile PeakBot) | 3 s | **crea** — Crea un custom command !nome (`nome: stringa*`, `risposta: stringa*`)<br>**modifica** — Modifica la risposta di un custom command (`nome: stringa*`, `risposta: stringa*`)<br>**elimina** — Elimina un custom command (`nome: stringa*`)<br>**lista** — Mostra tutti i custom command del server (nessun parametro) |
| `/costruisci` | Genera la struttura del server con la AI da una descrizione | 60 s | `descrizione: stringa*` |
| `/embed` | Crea un embed personalizzato con anteprima | 5 s | **crea** — Crea un embed tramite modulo e invialo nel canale scelto (`canale: canale*`) |
| `/evento` | Gestisci gli eventi programmati del server | 5 s | **crea** — Crea un evento programmato (`nome: stringa*`, `data-ora: stringa*`, `descrizione: stringa`, `canale-vocale: canale`)<br>**lista** — Mostra gli eventi programmati (nessun parametro)<br>**elimina** — Elimina un evento programmato (`id: stringa*`) |
| `/export` | Export dati del server e gestione backup (solo staff) | 30 s | **server** — Scarica un JSON con tutti i dati di questo server (nessun parametro)<br>**backup-ora** — Esegui subito il backup del database (nessun parametro)<br>**backup-lista** — Mostra gli ultimi 7 backup con data e dimensione (nessun parametro)<br>**backup-ripristina** — Ripristina un backup precedente (chiede conferma) (`nome: stringa*`) |
| `/giveaway` | Avvia un giveaway (il bot estrae un vincitore) | 10 s | `durata: stringa*`, `premio: stringa*`, `vincitori: intero`, `ruolo: ruolo` |
| `/help` | Mostra la lista di tutti i comandi disponibili | 5 s | — |
| `/inviti` | Statistiche inviti del server | 3 s | **info** — Chi ha invitato un utente e i suoi conteggi (`utente: utente`)<br>**classifica** — Top invitanti del server (nessun parametro) |
| `/lingua` | Imposta la lingua del bot per questo server | 3 s | **mostra** — Mostra la lingua attuale del server (nessun parametro)<br>**imposta** — Imposta la lingua del server (`lingua: stringa*`) |
| `/meteo` | Mostra il meteo di una città (Open-Meteo, gratis) | 10 s | `citta: stringa*`, `giorni: intero` |
| `/permessi` | Permessi personalizzati: limita i comandi a ruoli specifici (stile PeakBot) | 3 s | **imposta** — Consenti un comando solo a certi ruoli (max 5) (`comando: stringa*`, `ruolo: ruolo*`, `ruolo2: ruolo`, `ruolo3: ruolo`, `ruolo4: ruolo`, `ruolo5: ruolo`)<br>**rimuovi** — Togli un ruolo da un comando, o resetta il comando (senza ruolo) (`comando: stringa*`, `ruolo: ruolo`)<br>**mostra** — Mostra i permessi personalizzati (di un comando o di tutti) (`comando: stringa`)<br>**reset** — Azzera TUTTI i permessi personalizzati (con conferma) (nessun parametro) |
| `/ping` | Mostra la latenza del bot | 3 s | — |
| `/poll` | Crea un sondaggio con reazioni | 5 s | `domanda: stringa*`, `opzioni: stringa`, `durata: stringa` |
| `/profilo` | Mostra il profilo completo di un utente | 3 s | `utente: utente` |
| `/qr` | Genera un QR code dal testo (gratis, max 500 caratteri) | 3 s | `testo: stringa*`, `colore: stringa` |
| `/reactionroles` | Crea un pannello reaction roles con menu di selezione | 3 s | **crea** — Imposta canale, titolo e descrizione del pannello (`canale: canale*`, `titolo: stringa*`, `descrizione: stringa*`)<br>**aggiungi** — Aggiungi un ruolo al pannello (`ruolo: ruolo*`, `etichetta: stringa*`, `emoji: stringa*`)<br>**rimuovi** — Rimuovi un ruolo dal pannello (`ruolo: ruolo*`)<br>**pubblica** — Pubblica il pannello nel canale scelto (nessun parametro)<br>**elimina** — Elimina il pannello e la configurazione (nessun parametro) |
| `/remind` | Imposta un promemoria (es. 10m, 2h, 1d) | 5 s | `tempo: stringa*`, `testo: stringa*`, `canale: canale` |
| `/selfimprove` | Auto-miglioramento notturno del bot (stato, prova, esecuzione) | 60 s | **stato** — Stato: attivo? ultima run? provider AI? (nessun parametro)<br>**prova** — Prova ora in dry-run (propone senza applicare) (nessun parametro)<br>**esegui** — Esegui ora il ciclo completo (applica se i test passano) (nessun parametro) |
| `/serverinfo` | Mostra informazioni sul server | 5 s | — |
| `/setup` | Configura il bot per questo server | 3 s | **welcome** — Canale + messaggio di benvenuto (`canale: canale`, `messaggio: stringa`)<br>**goodbye** — Canale di addio (`canale: canale`)<br>**logs** — Canale log moderazione (`canale: canale`)<br>**suggest** — Canale suggerimenti (`canale: canale`)<br>**automod** — Attiva/disattiva automoderazione (`attiva: booleano*`)<br>**mostra** — Mostra la configurazione attuale (nessun parametro) |
| `/snipe` | Mostra l’ultimo messaggio cancellato del canale | 3 s | `canale: canale` |
| `/stanza` | Crea e gestisci le tue stanze private | 3 s | **crea** — Crea una stanza privata (max 3 per utente) (`nome: stringa`, `tipo: stringa`)<br>**aggiungi** — Aggiungi un utente alla stanza (`utente: utente*`)<br>**rimuovi** — Rimuovi un utente dalla stanza (`utente: utente*`)<br>**elimina** — Elimina questa stanza (nessun parametro) |
| `/starboard` | Configura la bacheca dei messaggi più apprezzati | 3 s | **imposta** — Imposta canale, soglia ed emoji della starboard (`canale: canale*`, `soglia: intero`, `emoji: stringa`)<br>**disattiva** — Disattiva la starboard (nessun parametro)<br>**mostra** — Mostra la configurazione attuale (nessun parametro) |
| `/suggest` | Invia un suggerimento per il server | 10 s | `testo: stringa*` |
| `/template` | Applica un template di struttura al server (stile PeakBot) | 10 s | **lista** — Mostra i template disponibili (nessun parametro)<br>**anteprima** — Mostra la struttura di un template senza crearla (`nome: stringa*`)<br>**applica** — Crea ruoli e canali del template (non cancella nulla) (`nome: stringa*`) |
| `/tempvoice` | Configura le vocali temporanee del server | 3 s | **imposta** — Imposta lobby e categoria delle vocali temporanee (`lobby: canale*`, `categoria: canale*`)<br>**disattiva** — Disattiva le vocali temporanee (nessun parametro)<br>**mostra** — Mostra la configurazione attuale (nessun parametro) |
| `/traduci` | Traduci un testo (MyMemory, gratis, max 500 caratteri) | 5 s | `testo: stringa*`, `da: stringa`, `a: stringa` |
| `/userinfo` | Mostra informazioni su un utente | 3 s | `utente: utente` |
| `/voice` | Gestisci la tua vocale temporanea | 3 s | **nome** — Rinomina la tua vocale (`nome: stringa*`)<br>**limite** — Imposta il limite di utenti (0 = nessun limite) (`numero: intero*`)<br>**blocca** — Blocca la vocale (nessun nuovo ingresso) (nessun parametro)<br>**sblocca** — Sblocca la vocale (nessun parametro)<br>**kick** — Disconnetti un utente dalla vocale (`utente: utente*`) |
| `/wizard` | Setup guidato del bot, passo passo (canali, ticket, automod…) | 5 s | — |
