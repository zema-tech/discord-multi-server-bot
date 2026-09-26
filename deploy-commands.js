require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;

  const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(folderPath, file));
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }
}

// Plugin droppabili da plugins/<nome>/ (vedi plugins/README.md): inclusi nel
// deploy, i nomi built-in vincono sempre.
try {
  const { loadPluginCommands } = require('./src/modules/pluginLoader');
  const { commands: pluginCommands, warnings } = loadPluginCommands();
  for (const w of warnings) console.warn(`[ATTENZIONE] ${w}`);
  const seen = new Set(commands.map((c) => c.name));
  for (const p of pluginCommands) {
    if (seen.has(p.name)) {
      console.warn(`[ATTENZIONE] Plugin "${p.pluginId}": comando /${p.name} duplicato di un built-in, saltato.`);
      continue;
    }
    seen.add(p.name);
    commands.push(p.mod.data.toJSON());
  }
} catch (e) {
  console.error(`[ERRORE] Deploy plugin fallito: ${e.message} (deploy built-in invariato)`);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Inizio registrazione di ${commands.length} comandi slash...`);

    let data;
    if (process.env.GUILD_ID) {
      // Deploy solo sul server di test (più veloce)
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`Registrati ${data.length} comandi sul server di test.`);
    } else {
      // Deploy globale (può richiedere fino a 1 ora)
      data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log(`Registrati ${data.length} comandi globalmente.`);
    }
  } catch (error) {
    console.error(error);
  }
})();
