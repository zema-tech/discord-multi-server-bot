'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/utility.js — Controller feature Utilità e configurazione generale. */
module.exports = defineModule({
  id: 'utility',
  title: 'Utilità',
  icon: 'sliders',
  section: 'Utilità',
  description: 'Setup guidato, sondaggi, giveaway, inviti, statistiche e info.',
  commands: ['setup', 'wizard', 'template', 'lingua', 'permessi', 'embed', 'costruisci', 'evento', 'giveaway', 'poll', 'suggest', 'inviti', 'serverinfo', 'analytics', 'avatar', 'profilo', 'remind', 'snipe', 'export', 'mydata', 'config', 'selfimprove', 'traduci', 'userinfo'],
  db: ['guildConfig', 'customPerms', 'invites', 'analytics'],
  events: ['guildMemberAdd', 'inviteTracker'],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
