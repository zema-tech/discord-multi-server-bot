require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN mancante! Copia .env.example in .env e configuralo.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
});

client.commands = new Collection();
client.cooldowns = new Collection();
// anti-spam in memoria: guildId -> userId -> [timestamp]
client.spamMap = new Map();

// Carica comandi (ricorsivo: sottocartelle supportate)
function loadCommands(dir, category = 'altri') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(full, entry.name);
    } else if (entry.name.endsWith('.js')) {
      let command;
      try {
        command = require(full);
      } catch (e) {
        console.error(`[ERRORE] Comando non caricato ${full}: ${e.message} (gli altri comandi restano attivi)`);
        continue;
      }
      if ('data' in command && 'execute' in command) {
        command.category = category;
        if (client.commands.has(command.data.name)) {
          console.warn(`[ATTENZIONE] Comando duplicato: ${command.data.name} (${full})`);
        }
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[ATTENZIONE] ${full} manca di "data" o "execute".`);
      }
    }
  }
}
loadCommands(path.join(__dirname, 'commands'));
console.log(`📦 Caricati ${client.commands.size} comandi.`);

// Carica eventi (un file con export non valido non deve spegnere il bot)
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  let event;
  try {
    event = require(path.join(eventsPath, file));
  } catch (e) {
    console.error(`[ERRORE] Evento non caricato ${file}: ${e.message} (gli altri eventi restano attivi)`);
    continue;
  }
  if (!event || typeof event.name !== 'string' || typeof event.execute !== 'function') {
    console.warn(`[ATTENZIONE] ${file} manca di "name" o "execute": evento saltato.`);
    continue;
  }
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

process.on('unhandledRejection', (e) => console.error('UnhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('UncaughtException:', e));

client.login(process.env.DISCORD_TOKEN);

// Dashboard web (stesso processo del bot). Parte solo se DASHBOARD_PORT è impostato;
// un fallimento qui non deve mai spegnere il bot.
if (process.env.DASHBOARD_PORT) {
  try {
    require('./dashboard/server').startDashboard(client);
  } catch (e) {
    console.error('[Dashboard] avvio fallito:', e.message);
  }
}
