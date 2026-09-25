'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/ai.js — Controller feature AI (risposte, analisi, cervello). */
module.exports = defineModule({
  id: 'ai',
  title: 'AI',
  icon: 'cpu',
  section: 'AI & Extra',
  description: 'Risposte intelligenti, analisi, riassunti e memoria del server.',
  commands: ['chiedi', 'riassumi', 'codice', 'analizza', 'immagina', 'storia', 'brain', 'ai-config'],
  db: ['aiConfig', 'aiUsage'],
  events: ['aiMention', 'aiModeration'],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
