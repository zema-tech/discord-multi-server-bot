'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/music.js — Controller feature Musica vocale. */
module.exports = defineModule({
  id: 'music',
  title: 'Musica',
  icon: 'mic',
  section: 'Contenuti',
  description: 'Riproduzione musicale nei canali vocali.',
  commands: ['musica'],
  db: [],
  events: [],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
