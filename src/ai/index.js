'use strict';
/**
 * src/ai/ — tutta l'intelligenza del bot in una cartella:
 *
 *   ai.js            facciata stabile (askAI, aiStatus) — unico ingresso per i consumer
 *   aiProviders.js   core multi-provider (OpenAI/Anthropic/Gemini/Groq/OpenRouter/Pollinations)
 *   brain/           cervello stile Obsidian: skill, memorie, file, persone, profilo,
 *                    auto-learn e kernel di contesto (dati in ./brain alla repo root)
 *
 * Restano fuori di proposito (convenzioni dei loader):
 *   commands/ai/     slash commands (loader ricorsivo src/commands)
 *   events/ai*.js    listener (loader src/events)
 *   database/ai*.js  config e contatori (convenzione database/)
 *   modules/ai.js    descrittore feature per Commander/registry
 */
module.exports = {
  ...require('./ai'),
  brain: {
    kernel: require('./brain/kernel'),
    memory: require('./brain/memory'),
    skills: require('./brain/skills'),
    files: require('./brain/files'),
    people: require('./brain/people'),
    profile: require('./brain/profile'),
    learn: require('./brain/learn'),
  },
};
