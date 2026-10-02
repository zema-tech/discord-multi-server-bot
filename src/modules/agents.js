'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/agents.js — Controller feature Agenti (JARVIS + specialisti). */
module.exports = defineModule({
  id: 'agents',
  title: 'Agenti',
  icon: 'zap',
  section: 'AI & Extra',
  description: 'JARVIS e specialisti in sandbox, con control-room e approvazioni.',
  commands: ['jarvis'],
  db: ['agents'],
  events: [],
  handlers: [],
  locked: false,
  version: '1.0.0',
});
