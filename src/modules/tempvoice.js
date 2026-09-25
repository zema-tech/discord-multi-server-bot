'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/tempvoice.js — Controller feature Stanze vocali e stanze private. */
module.exports = defineModule({
  id: 'tempvoice',
  title: 'Vocali temporanee',
  icon: 'mic',
  section: 'Ticket & Vocali',
  description: 'Vocali private dalla lobby e stanze testuali personali.',
  commands: ['tempvoice', 'voice', 'stanza'],
  db: ['tempvoice', 'stanze'],
  events: ['tempVoice'],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
