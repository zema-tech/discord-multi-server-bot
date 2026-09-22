'use strict';
/** src/modules/ai.js — Controller feature AI (risposte, analisi, cervello). */
module.exports = {
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
};
