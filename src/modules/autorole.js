'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/autorole.js — Controller feature Ruoli automatici. */
module.exports = defineModule({
  id: 'autorole',
  title: 'Autorole',
  icon: 'users',
  section: 'Utilità',
  description: 'Ruoli assegnati in automatico ai nuovi membri.',
  commands: ['autorole'],
  db: ['autorole'],
  events: ['autorole'],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
