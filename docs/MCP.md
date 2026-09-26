# MCP — collega Claude al bot

Il bot espone un **MCP server** (Streamable HTTP) su `POST /mcp`: Claude opera
il bot via Commander — moduli, salute, statistiche, cervello — solo nel server
legato al tuo token. Niente password Discord a Claude, solo un token revocabile.

## 1. Crea il token (una volta, da Discord)

Essendo proprietario del server:

```
/token crea nome:claude-casa
```

Copia il token mostrato (non sarà più recuperabile) e l'endpoint:

```
https://TUO-HOST/mcp
```

## 2. Collega Claude

**Claude Code** (consigliato):

```bash
claude mcp add --transport http discord-bot https://TUO-HOST/mcp \
  --header "Authorization: Bearer dbt_..."
```

**Claude Desktop**: `Impostazioni → Connettori → Aggiungi` con URL + header
`Authorization: Bearer dbt_...`.

**Altri client MCP**: endpoint `POST /mcp`, protocollo `2025-06-18`,
metodi `initialize`, `tools/list`, `tools/call`.

## 3. Cosa può fare Claude

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

## 4. Gestione

- `/token lista` — usi e ultimo uso di ogni token
- `/token revoca id:...` — stacca Claude subito

Sicurezza: token salvati solo come sha256, mai nei log; revoca istantanea;
ogni toggle passa dal gate Commander come tutto il resto.
