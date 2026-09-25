'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/levels.js — Controller feature Livelli XP (incl. ricompense). */
module.exports = defineModule({
  id: 'levels',
  title: 'Livelli',
  icon: 'star',
  section: 'Livelli',
  description: 'XP da messaggi e vocali, classifiche e ruoli premio.',
  commands: ['rank', 'top', 'premi'],
  db: ['levels', 'levelRewards'],
  events: ['voiceXp'],
  handlers: [],
  ambient: ['XP testuale in messageCreate'],
  locked: false,
  version: '1.0.0',
});
