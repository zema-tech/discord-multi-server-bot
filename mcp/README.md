# MCP — collega il bot alle IA (stile Hermes Agent)

Questa cartella è la **configurazione pubblica** del Model Context Protocol,
ispirata a [NousResearch/hermes-agent](https://github.com/nousresearch/hermes-agent)
(`mcp_servers` in `config.yaml`, catalog opzionale, filtering `tools.include/exclude`,
trasporti stdio + Streamable HTTP, prefisso `mcp_<server>_<tool>`).

Il bot parla MCP in **due direzioni**:

| Direzione | Dove vive il codice | Cosa fa |
|---|---|---|
| **A. Server** (bot espone tool) | `src/mcp/` (`protocol.js`, `auth.js`, `server.js`, `tools/`) | Claude/ChatGPT/Codex operano il bot via `POST /mcp` con token `/token crea`. Vedi `docs/MCP.md`. |
| **B. Client/Host** (bot usa tool esterni) | `src/mcp/client/` (`config.js`, `transports.js`, `manager.js`, `aiBridge.js`) | Il bot si collega a MCP server esterni (filesystem, github, fetch, DB…) e li usa come tool `mcp_<server>_<tool>`, anche dalla AI (`/chiedi`, brain). **Questa cartella** configura la direzione B. |

## Quickstart (direzione B: il bot chiama le IA / i tool MCP)

```bash
# 1. Copia l'esempio (mai committare il file reale: contiene token)
cp mcp/servers.example.json mcp/servers.json

# 2. Modifica mcp/servers.json: abilita solo ciò che ti serve
# 3. (opzionale) imposta il path via env
# MCP_SERVERS_PATH=./mcp/servers.json

# 4. Riavvia il bot, poi da Discord:
/mcp stato    # quali server sono connessi + quanti tool (+ scope guilds)
/mcp lista    # nomi tool mcp_<server>_<tool> visibili in QUESTO server
/mcp cerca query:github issue  # ricerca tool (discovery runtime stile Composio)
/mcp ricarica # rilegge mcp/servers.json senza riavviare
```

Zero nuove dipendenze npm: stdio via `child_process`, HTTP via `fetch` nativa.

## File in questa cartella

| File | Uso |
|---|---|
| `servers.example.json` | Esempio `mcp_servers` stile Hermes: stdio locali + HTTP remoti + filtri. Copialo in `servers.json` (gitignored). |
| `catalog.json` | Catalogo curato stile `optional-mcps/`: un click per i provider IA più comuni (OpenAI-compatibile, Ollama locale, filesystem, github, fetch, sqlite). |
| `claude.example.json` | Snippet **direzione A**: come collegare Claude Code/Desktop **al** bot (`POST https://TUO-HOST/mcp` + `Authorization: Bearer dbt_...`). |
| `README.md` | Questo file. |

## Formato `servers.json` (compatibile Hermes, subset)

```json
{
  "mcp_servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
      "enabled": true,
      "tools": { "include": ["read_file", "list_directory"] }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." },
      "enabled": false
    },
    "mia-api": {
      "url": "https://mcp.mia-azienda.it/mcp",
      "headers": { "Authorization": "Bearer ..." },
      "enabled": true,
      "tools": { "exclude": ["delete_*"] }
    }
  }
}
```

Chiavi supportate per server (come Hermes): `command`, `args`, `env`, `cwd`,
`url`, `headers`, `timeout` (ms, default 30000), `enabled` (default true),
`guilds` (allowlist ID server stile Composio: i tool di quel server esistono
solo lì — `/mcp lista`, `/mcp cerca`, `/mcp chiama` e la AI li vedono solo in
quei server; assente = tutti),
`tools.include` / `tools.exclude` (stringhe esatte o glob `*`/`?`, `include` vince),
`tools.resources` / `tools.prompts` (`false` = nasconde i wrapper utility).
Forma corta ammessa: `"filesystem": { "command": ..., "args": [...] }` oppure
root piatto senza chiave `mcp_servers` (tutto il JSON = mappa server).

Variabili d'ambiente:

| Var | Default | Effetto |
|---|---|---|
| `MCP_ENABLED` | `1` | `0` = client disattivato (il server `/mcp` resta attivo). |
| `MCP_SERVERS_PATH` | `./mcp/servers.json` | Path del file config direzione B. |
| `MCP_TIMEOUT` | `30000` | Timeout ms per `tools/call` verso server esterni. |

## Collegare le IA più comuni (direzione B)

Il bot ha già il provider nativo in `src/ai/aiProviders.js`
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, fallback gratis Pollinations). MCP **non sostituisce**
quelle chiavi: aggiunge *tool* che la AI può chiamare. Esempi pronti in
`servers.example.json`:

- **Filesystem** (`npx @modelcontextprotocol/server-filesystem`) — la AI legge/scrive solo la dir che whitelisti.
- **GitHub** (`npx @modelcontextprotocol/server-github`) — issue/PR via `GITHUB_PERSONAL_ACCESS_TOKEN`.
- **Fetch** (`npx @modelcontextprotocol/server-fetch`) — la AI fa GET sicuri sul web.
- **SQLite** (`npx @modelcontextprotocol/server-sqlite --db-path ...`) — query in sola lettura sul tuo DB.
- **Ollama locale** (HTTP `http://localhost:11434/mcp` se esponi un bridge OpenAI-compatibile) — IA on-premise, zero cloud.
- **Qualunque endpoint OpenAI-compatibile** — punta `url` al tuo gateway (LiteLLM, OpenRouter MCP, ecc.) con `headers.Authorization`.

Per i dettagli Hermes da cui è preso spunto (OAuth, `lazy`, `supports_parallel_tool_calls`,
sampling, catalog install): vedi la sezione MCP Integration nei docs Hermes linkati sopra.
Questo client implementa il subset utile al bot: discovery all'avvio, `tools/list` +
`tools/call`, `notifications/tools/list_changed` (via `/mcp ricarica`), filtri include/exclude,
prefisso anti-collisione `mcp_<server>_<tool>`, wrapper `list_resources`/`read_resource`/
`list_prompts`/`get_prompt` solo se il server li supporta.

## Sicurezza

- `mcp/servers.json` è nel `.gitignore`: contiene token. Committare solo `servers.example.json`.
- stdio: al subprocess passa **solo** `env` dichiarato + baseline sicura (`PATH`, `HOME`, `USER`…), mai tutto `process.env` (come Hermes).
- Filtra i tool pericolosi: `tools.exclude: ["delete_*", "write_*"]` sui server sensibili; `include` vince su `exclude` se entrambi presenti (regola Hermes).
- I tool MCP esterni girano con gli stessi permessi del bot: non whitel stare mai `/` o `.env`.
