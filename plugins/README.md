# Plugins — estendi il bot senza toccare il core

Un **plugin** è una cartella droppabile in `plugins/<nome>/` con un manifest
`plugin.json` + comandi slash in `commands/*.js` (stessa forma dei comandi in
`src/commands/`: export `data`, `execute`, `cooldown`).

```
plugins/
  README.md                ← questo file
  esempio-saluto/          ← plugin di esempio, già attivo
    plugin.json
    commands/saluto.js
    README.md
```

## Installare un plugin

```bash
cp -r /percorso/mio-plugin plugins/mio-plugin
npm run deploy   # registra anche i comandi dei plugin su Discord
# riavvia il bot
```

All'avvio il bot carica i comandi dei plugin dopo quelli built-in
(`src/modules/pluginLoader.js`); in caso di nome duplicato vince il comando
built-in e il plugin viene saltato con un warning nei log. Anche
`npm run deploy` include i comandi dei plugin.

## Creare un plugin

1. Crea `plugins/<nome>/plugin.json`:

```json
{
  "id": "mio-plugin",
  "version": "1.0.0",
  "title": "Mio Plugin",
  "description": "Cosa fa, in una riga.",
  "author": "tuo-nome",
  "commands": ["mio-comando"]
}
```

Regole manifest (validate dal loader, i plugin non validi vengono scartati con
warning, mai crash):
- `id`: 2-32 char, inizia con lettera, solo lettere/numeri/trattini (stesso
  contratto di `src/modules/defineModule.js`).
- `version`: semver `x.y.z`.
- `commands`: nomi slash dichiarati (devono corrispondere ai file in
  `commands/`, altrimenti warning).

2. Aggiungi un file per comando in `plugins/<nome>/commands/<comando>.js`:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mio-comando')
    .setDescription('Cosa fa'),
  cooldown: 3,
  async execute(interaction) {
    await interaction.reply('Ciao dal plugin!').catch(() => null);
  },
};
```

3. Copia `plugins/esempio-saluto/` come base: è un plugin completo e funzionante.

## Sicurezza

- I plugin girano **con gli stessi permessi del bot**: installa solo plugin di
  fonti fidate, leggi il codice prima (sono pochi file).
- Niente `eval`/`Function`, niente `child_process`, niente accessi fuori dalla
  cartella del plugin: il loader rifiuta i file che non rispettano la forma
  `data`/`execute`/`cooldown`, ma la revisione umana resta obbligatoria.
- I segreti vanno nel `.env` del bot, mai nel codice del plugin.
