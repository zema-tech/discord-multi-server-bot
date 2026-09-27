'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/youtube.js — Controller feature Notifiche YouTube (RSS, zero chiavi). */
module.exports = defineModule({
  id: 'youtube',
  title: 'Notifiche YouTube',
  icon: 'tv',
  section: 'Contenuti',
  description: 'Annuncia i nuovi video dei canali seguiti (feed RSS).',
  commands: ['youtube'],
  db: ['youtube'],
  events: [],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
