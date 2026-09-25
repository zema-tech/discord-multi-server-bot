'use strict';
const { defineModule } = require('./defineModule');
/**
 * src/modules/system.js — Controller feature Sistema (sempre attiva, locked).
 * Comandi essenziali che non si possono disattivare per guild.
 */
module.exports = defineModule({
  id: 'system',
  title: 'Sistema',
  icon: 'server',
  section: 'Sistema',
  description: 'Comandi essenziali sempre attivi (aiuto e stato).',
  commands: ['help', 'ping', 'modulo'],
  db: [],
  events: [],
  handlers: [],
  locked: true,
  version: '1.0.0',
});
