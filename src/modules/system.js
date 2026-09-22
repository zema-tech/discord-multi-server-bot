'use strict';
/**
 * src/modules/system.js — Controller feature Sistema (sempre attiva, locked).
 * Comandi essenziali che non si possono disattivare per guild.
 */
module.exports = {
  id: 'system',
  title: 'Sistema',
  icon: 'server',
  section: 'Sistema',
  description: 'Comandi essenziali sempre attivi (aiuto e stato).',
  commands: ['help', 'ping'],
  db: [],
  events: [],
  handlers: [],
  locked: true,
};
