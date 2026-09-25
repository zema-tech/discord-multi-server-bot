'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/starboard.js — Controller feature Starboard. */
module.exports = defineModule({
  id: 'starboard',
  title: 'Starboard',
  icon: 'star',
  section: 'Utilità',
  description: 'Messaggi in evidenza dopo N reazioni.',
  commands: ['starboard'],
  db: ['starboard'],
  events: ['starboard'],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
