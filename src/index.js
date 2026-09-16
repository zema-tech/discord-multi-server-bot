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
      const command = require(full);
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

// Carica eventi
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

process.on('unhandledRejection', (e) => console.error('UnhandledRejection:', e));

client.login(process.env.DISCORD_TOKEN);
