'use strict';
/** src/modules/autoresponder.js — Controller feature Risposte automatiche. */
module.exports = {
  id: 'autoresponder',
  title: 'Risposte automatiche',
  icon: 'message',
  section: 'AI & Extra',
  description: 'Trigger parola-frase con risposta automatica del bot.',
  commands: ['autoresponder'],
  db: ['autoresponder'],
  events: ['autoResponder'],
  handlers: [],
  locked: false,
  statsExtra(gid) {
    try {
      const ar = require('../database/autoresponder');
      if (ar && typeof ar.listTriggers === 'function') {
        return { triggers: ar.listTriggers(gid).length };
      }
    } catch { /* health mai bloccante */ }
    return {};
  },
};
