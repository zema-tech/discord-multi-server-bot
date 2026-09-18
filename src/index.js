require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const store = require('./database/store');
const pkg = require('../package.json');
const { getEnv, validateEnv } = require('./utils/env');

// Validazione env centralizzata (default documentati in src/utils/env.js).
const env = getEnv();
const envCheck = validateEnv();
for (const w of envCheck.warnings) {
  console.warn(`[ATTENZIONE] ${w}`);
}
if (!envCheck.ok) {
  for (const e of envCheck.errors) {
    console.error(`❌ ${e}`);
  }
  console.error('❌ Avvio annullato: copia .env.example in .env e configura le variabili mancanti.');
  process.exit(1);
}

// Banner di avvio.
{
  const dashInfo = env.DASHBOARD_PORT ? `attiva (porta ${env.DASHBOARD_PORT})` : 'disattiva';
  console.log('============================================================');
  console.log(`  🤖 ${pkg.name} v${pkg.version}`);
  console.log(`  Node ${process.version} | DB backend: ${env.DB_BACKEND} | Dashboard: ${dashInfo}`);
  console.log('  Avvio in corso...');
  console.log('============================================================');
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

process.on('unhandledRejection', (e) => {
  console.error('UnhandledRejection:', e);
  try {
    logger.error('UnhandledRejection', { stack: e?.stack?.split('\n').slice(0, 3).join(' | ') || String(e) });
  } catch {}
});
process.on('uncaughtException', (e) => {
  console.error('UncaughtException:', e);
  try {
    logger.error('UncaughtException', { stack: e?.stack?.split('\n').slice(0, 3).join(' | ') || String(e) });
  } catch {}
});

client.login(env.DISCORD_TOKEN);

// Dashboard web (stesso processo del bot). Parte solo se DASHBOARD_PORT è impostato;
// un fallimento qui non deve mai spegnere il bot.
if (env.DASHBOARD_PORT) {
  try {
    require('./dashboard/server').startDashboard(client);
  } catch (e) {
    console.error('[Dashboard] avvio fallito:', e.message);
  }
}

// Graceful shutdown (SIGINT/SIGTERM): chiude storage e client, poi esce con 0.
// Il force-timer garantisce l'uscita entro 5s anche se qualcosa si blocca.
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Segnale ${signal} ricevuto: chiusura in corso...`);
  try {
    logger.info('Shutdown', { signal });
  } catch {}
  const forceTimer = setTimeout(() => {
    console.error('⚠️ Chiusura forzata dopo 5s di timeout.');
    process.exit(0);
  }, 5000);
  if (typeof forceTimer.unref === 'function') forceTimer.unref();

  try {
    store.close();
    console.log('💾 Storage chiuso.');
  } catch (e) {
    console.error(`[ERRORE] Chiusura storage fallita: ${e && e.message ? e.message : e}`);
  }
  try {
    client.destroy();
    console.log('👋 Connessione Discord chiusa. Arrivederci!');
  } catch (e) {
    console.error(`[ERRORE] Chiusura client Discord fallita: ${e && e.message ? e.message : e}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
