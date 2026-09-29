# MCP — telecomando del bot (stile Hermes Agent)

Ispirato a [NousResearch/hermes-agent](https://github.com/nousresearch/hermes-agent):
stessi concetti (`mcp_servers`, `tools.include/exclude`, stdio + Streamable HTTP,
prefisso `mcp_<server>_<tool>`), adattati al bot.

| Direzione | Cosa fa | Config |
|---|---|---|
| **A. Server** (IA → bot) | Claude/ChatGPT operano il bot via `POST /mcp` | `/token crea`, snippet in `mcp/claude.example.json` |
| **B. Client** (bot → IA/tool) | Il bot usa MCP server esterni come tool | `mcp/servers.json` (da `mcp/servers.example.json`), comando `/mcp` |

## A. Server — telecomando del bot

Il bot espone un **MCP server** (Streamable HTTP) su `POST /mcp`. Protocollo
(`src/mcp/protocol.js`) e auth Bearer (`src/mcp/auth.js`) sono stabili e non si
toccano: ogni token vale per **un solo server** e ogni tool lo enforza.

### A.1. Crea il token (una volta, da Discord)

Essendo proprietario del server:

```
/token crea nome:claude-casa
```

Copia il token mostrato (non sarà più recuperabile) e l'endpoint:

```
https://TUO-HOST/mcp
```

### A.2. Collega Claude

**Claude Code** (consigliato):

```bash
claude mcp add --transport http discord-bot https://TUO-HOST/mcp \
  --header "Authorization: Bearer dbt_..."
```

**Claude Desktop**: `Impostazioni → Connettori → Aggiungi` con URL + header
`Authorization: Bearer dbt_...`. Lo stesso snippet è pronto in
`mcp/claude.example.json`.

**Altri client MCP**: endpoint `POST /mcp`, protocollo `2025-06-18`,
metodi `initialize` (risponde con header `Mcp-Session-Id`, da rimandare),
`tools/list`, `tools/call`. `GET /mcp` apre uno stream SSE (serve sessione),
`DELETE /mcp` la chiude.

Struttura codice: `src/mcp/` — `protocol.js` (JSON-RPC, stabile), `auth.js`
(Bearer + sessioni, stabile), `tools/` (un file per area + `index.js`
registro: nuovo tool = nuovo file + una riga), `server.js` (mount Express).

### A.3. Regole di scope (valgono per tutti i tool)

1. Ogni chiamata richiede `guildId`, che deve matchare il server del token
   (403 logico altrimenti) — helper condiviso `src/mcp/tools/scope.js`.
2. Lo **status viene dal roster**: `module_status` e `guild_info` includono la
   voce presence del server (nome, membri, freschezza snapshot) letta dal DB
   condiviso. Se il bot non è (più) nel server, il tool lo segnala
   (`botPresente: false`) ma risponde comunque — il roster è informativo,
   mai un blocco.
3. I `limit` dei top sono cappati (default 10, max 25).

### A.4. Tool di lettura (mai scritture)

| Tool | Cosa fa |
|------|---------|
| `modules_list` | moduli, versioni, comandi |
| `module_status` | on/off, protezione 🛡️, errori (per server) |
| `module_toggle` | accende/spegne un modulo |
| `module_reset` | azzera errori e protezione (recupero) |
| `guild_snapshot` | moduli + ticket + top livelli |
| `brain_search` | cerca in skill/memorie/file del server |
| `ticket_stats` | per tipo, chiusura media, rating, top staff |
| `tickets_open` | ticket aperti con priorità e claim |
| `brain_note_save` / `brain_note_forget` | scrive/cancella memorie del server |
| `settings_get` / `settings_set` | provider IA, limiti, log (mai chiavi API) |
| `economy_top`, `levels_top` | classifiche |
| `user_cases` / `mod_history` | storico moderazione utente |
| `bot_health` | uptime, modalità, backend (null onesti senza client) |
| `config_get`, `shop_list`, `invites_top`, `channels_list`, `roles_list`, `analytics_summary`, `guild_info` | letture extra |
| `module_reload`, `module_config`, `announce_send` | scritture via Commander |
| `economy_top` | top portafogli (`limit`) |
| `levels_top` | top livelli/XP (`limit`) |
| `mod_history` | storico moderazione di un utente (`userId`, `limit`) |
| `analytics_summary` | messaggi/ingressi/uscite ultimi N giorni (`days`, max 30) |
| `config_get` | config server in sola lettura (lingua, canali, automod…) |
| `shop_list` | catalogo ruoli in vendita |
| `invites_top` | top invitanti (`limit`) |
| `channels_list` | canali live da Discord (id, nome, tipo) |
| `roles_list` | ruoli live da Discord (id, nome, colore) |

### A.5. Tool di scrittura (via Commander + scope, mai DB diretti)

| Tool | Cosa fa | Gate |
|------|---------|------|
| `module_toggle` | accende/spegne un modulo | `Commander.setModuleEnabled` |
| `module_reload` | ricarica senza restart, azzera errori+breaker | `Commander.reloadModule` |
| `module_reset` | azzera errori+protezione | `Commander.resetModule` |
| `module_config` | cambia config (general, welcome, logging, levels, automod, autorole, starboard, confessioni, tickets, tempvoice, ai). Leggi prima con `config_get`. Patch max 20 chiavi, valori max 2KB | `Commander.updateModuleConfig` |
| `announce_send` | invia un messaggio in un canale testuale **del server** (verificato in lista live, max 2000 char, @everyone/@here neutralizzati) | REST Bot token + scope canale |

Esempio (Claude): "leggi `config_get`, alza il livello di automod con
`module_config`, conferma con `module_status`, avvisa in #annunci con
`announce_send`".

### A.6. Gestione

- `/token lista` — usi e ultimo uso di ogni token
- `/token revoca id:...` — stacca Claude subito

Sicurezza: token salvati solo come sha256, mai nei log; revoca istantanea;
ogni scrittura passa dal gate Commander come tutto il resto.

## B. Client — collega il bot alle IA (stile Hermes)

Il bot diventa **host MCP**: si collega a server esterni (filesystem, github,
fetch, sqlite, gateway OpenAI-compatibile, Ollama locale) e li espone come
tool `mcp_<server>_<tool>`, usabili da Discord (`/mcp chiama`) e dalla AI.

```bash
cp mcp/servers.example.json mcp/servers.json  # MAI committare servers.json (token!)
# abilita un server in servers.json, poi da Discord:
/mcp stato     # connessi / falliti / tool registrati
/mcp lista     # nomi mcp_<server>_<tool>
/mcp chiama nome:mcp_fetch_fetch argomenti:{"url":"https://..."}
/mcp ricarica  # rilegge servers.json senza riavviare
```

Dettagli formato, catalogo (`mcp/catalog.json`) e sicurezza stdio: vedi
`mcp/README.md`. Codice: `src/mcp/client/` — `config.js` (loader `mcp_servers`
+ `${VAR}`), `transports.js` (stdio + Streamable HTTP, sanitizzazione TAG),
`manager.js` (discovery a ondate da 4, filtri include/exclude con glob,
`include` vince, wrapper resources/prompts solo se supportati),
`aiBridge.js` (function-specs per la AI), `index.js` (singleton lazy).

Env: `MCP_ENABLED=1`, `MCP_SERVERS_PATH=./mcp/servers.json`, `MCP_TIMEOUT=30000`.
La AI nativa resta in `src/ai/aiProviders.js` (chiavi `OPENAI_API_KEY` ecc.,
fallback gratis Pollinations): MCP aggiunge *tool*, non sostituisce i provider.
