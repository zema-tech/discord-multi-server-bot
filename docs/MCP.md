# MCP — due direzioni (stile Hermes Agent)

Ispirato a [NousResearch/hermes-agent](https://github.com/nousresearch/hermes-agent):
stessi concetti (`mcp_servers`, `tools.include/exclude`, stdio + Streamable HTTP,
prefisso `mcp_<server>_<tool>`), adattati al bot.

| Direzione | Cosa fa | Config |
|---|---|---|
| **A. Server** (IA → bot) | Claude/ChatGPT operano il bot via `POST /mcp` | `/token crea`, snippet in `mcp/claude.example.json` |
| **B. Client** (bot → IA/tool) | Il bot usa MCP server esterni come tool | `mcp/servers.json` (da `mcp/servers.example.json`), comando `/mcp` |

## A. Server — collega Claude al bot

Il bot espone un **MCP server** (Streamable HTTP) su `POST /mcp`: Claude opera
il bot via Commander — moduli, salute, statistiche, cervello — solo nel server
legato al tuo token. Niente password Discord a Claude, solo un token revocabile.

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

Struttura codice: `src/mcp/` — `protocol.js` (JSON-RPC), `auth.js`
(Bearer + sessioni), `tools/` (un file per area + `index.js` registro:
nuovo tool = nuovo file + una riga), `server.js` (mount Express).

### A.3. Cosa può fare Claude

| Tool | Cosa fa |
|------|---------|
| `modules_list` | moduli, versioni, comandi |
| `module_status` | on/off, protezione 🛡️, errori (per server) |
| `module_toggle` | accende/spegne un modulo |
| `guild_snapshot` | moduli + ticket + top livelli |
| `brain_search` | cerca in skill/memorie/file del server |
| `ticket_stats` | per tipo, chiusura media, rating, top staff |

Ogni chiamata richiede `guildId`, che deve matchare il server del token
(403 logico altrimenti). Rate-limit come le API dashboard.

### A.4. Gestione

- `/token lista` — usi e ultimo uso di ogni token
- `/token revoca id:...` — stacca Claude subito

Sicurezza: token salvati solo come sha256, mai nei log; revoca istantanea;
ogni toggle passa dal gate Commander come tutto il resto.

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
