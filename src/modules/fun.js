'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/fun.js — Controller feature Contenuti divertenti e social. */
module.exports = defineModule({
  id: 'fun',
  title: 'Contenuti',
  icon: 'message',
  section: 'Contenuti',
  description: 'Giochi, social, confessioni anonime e sfide settimanali.',
  commands: ['8ball', 'affinita', 'coinflip', 'dice', 'joke', 'meme', 'oroscopo', 'preferiresti', 'rps', 'trivia', 'animale', 'confessa', 'sfida', 'meteo', 'qr'],
  db: ['sfide', 'confessioni'],
  events: ['sfidaTracker'],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
