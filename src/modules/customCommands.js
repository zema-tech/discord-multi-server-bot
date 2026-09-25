'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/customCommands.js — Controller feature Comandi personalizzati. */
module.exports = defineModule({
  id: 'customCommands',
  title: 'Comandi custom',
  icon: 'terminal',
  section: 'AI & Extra',
  description: 'Comandi testuali !nome con variabili e anteprima.',
  commands: ['comando'],
  db: ['customCommands'],
  events: ['customCommands'],
  handlers: [],
  locked: false,
  statsExtra(gid) {
    try {
      const cc = require('../database/customCommands');
      if (cc && typeof cc.list === 'function') {
        return { commands: cc.list(gid).length };
      }
    } catch { /* health mai bloccante */ }
    return {};
  },
  version: '1.0.0',
});
