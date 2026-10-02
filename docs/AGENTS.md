# Agenti — JARVIS + specialisti (ZealBot)

`/jarvis` affida compiti in linguaggio naturale. **JARVIS** (orchestratore)
capisce, smista allo specialista giusto e resta responsabile del risultato.
Gli specialisti non si chiamano tra loro: solo JARVIS → specialista
(stesso principio del Commander: cervello → muscoli).

## Gli agenti

| Agente | Ruolo | Esempi di compiti |
|--------|-------|-------------------|
| ⚡ **JARVIS** | Orchestratore + generalista | qualsiasi cosa; smista se serve |
| 🛡️ **Sentinel** | Moderazione e sicurezza | piano anti-raid, soglie automod, procedure ban |
| 🎫 **Steward** | Ticket e supporto | risposte pronte, moduli di accoglienza |
| 🎵 **Maestro** | Musica e vocali | code, setup comandi musicali |
| 💰 **Banker** | Economia e livelli | bilanci, premi, configurazioni XP |
| 📚 **Lore** | Conoscenza e codice | riassunti, spiegazioni, memoria server |
| 🔭 **Scout** | Web e servizi esterni | leggere pagine, usare servizi loggati |

Uso: `/jarvis compito:<testo>` (JARVIS sceglie) oppure `/jarvis compito:<testo> agente:scout` (forzato).
Il routing senza AI è a parole chiave e funziona sempre; con una chiave AI
(anche gratis via default, vedi `.env.example`) gli specialisti ragionano
a passi (ReAct, max `JARVIS_MAX_STEPS`).

## Sandbox per-agente

Ogni esecuzione gira in sandbox applicativa (`src/agents/sandbox.js`):

- **capability-based**: solo i tool del manifest (`say`, `note`, `fetchUrl`, `useService`, `askOwner`) — niente `require`/`fs`/rete liberi;
- **jail directory**: `data/sandboxes/<agente>/` (gitignored);
- **timeout**: `JARVIS_TASK_TIMEOUT_MS` (default 2 min);
- **audit**: start/fine/errori nel logger, mai segreti nei log.

È isolamento logico, non una VM: protegge da errori e abusi via tool,
non da codice nativo ostile (i plugin restano isolati dal pluginLoader).

## Goggles — la control-room (`/agents.html`)

Gli agenti non hanno uno schermo da condividere davvero: i goggles sono
la **traccia live** di ogni sessione (pensieri → azioni → osservazioni →
risultato), visibile in diretta su dashboard e alimentata dallo store
condiviso (bot e dashboard sono processi separati).

Dalla control-room puoi:

- 👁️ **entrare nello schermo**: apri una sessione e vedi lo stream live (SSE);
- 🎧 **take-over**: dettare un'istruzione letta al passo successivo;
- ✅/⛔ **approvare o negare** le richieste in attesa;
- 🔑 vedere **quali servizi** hanno credenziali nel vault (mai i valori).

Su Discord, le approvazioni arrivano anche come bottoni
(Approva/Nega) nel canale dove hai lanciato `/jarvis`.

## Vault — login ai servizi

Il proprietario salva credenziali (token/API key) e gli agenti **usano i
servizi senza mai vedere i segreti**:

1. imposta `VAULT_KEY` nel `.env` (min 16 caratteri, mai committarla);
2. salva la credenziale (via codice: `vault.storeSecret(servizio, account, segreto)`);
3. lo specialista (oggi solo Scout) chiama `useService`: parte una
   **richiesta di approvazione** (dashboard + Discord);
4. approvato → il **broker** inietta `Authorization: Bearer <segreto>` in
   una chiamata https e restituisce solo l'esito (il segreto viene oscurato
   se ricompare nell'output).

Limiti onesti: solo Bearer su https, niente host interni; **niente bypass
di captcha/2FA/login interattivi** — per quelli serve l'umano. Ogni uso è
tracciato (servizio, account, agente, sessione).

## File

```text
src/agents/            manifest, router (JARVIS), sandbox, sessions,
                       approvals, vault, tools, index (facciata)
src/commands/ai/jarvis.js   /jarvis + bottoni approvazione
src/modules/agents.js       feature Commander (toggle per guild)
src/dashboard/agentsRoutes.js + public/agents.html   control-room
```

Env: `VAULT_KEY`, `JARVIS_TASK_TIMEOUT_MS`, `JARVIS_APPROVAL_TIMEOUT_MS`,
`JARVIS_MAX_STEPS` (vedi `.env.example`).
