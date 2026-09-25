'use strict';
const { defineModule } = require('./defineModule');
/** src/modules/reactionRoles.js — Controller feature Reaction roles. */
module.exports = defineModule({
  id: 'reactionRoles',
  title: 'Reaction roles',
  icon: 'check',
  section: 'Utilità',
  description: 'Ruoli self-service assegnati con reazioni o pannello.',
  commands: ['reactionroles'],
  db: ['reactionRoles'],
  events: [],
  handlers: ['reactionRoleHandler'],
  locked: false,
  version: '1.0.0',
});
