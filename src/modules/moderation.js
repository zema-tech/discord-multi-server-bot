'use strict';
/** src/modules/moderation.js — Controller feature Moderazione (incl. automod). */
module.exports = {
  id: 'moderation',
  title: 'Moderazione',
  icon: 'shield',
  section: 'Moderazione',
  description: 'Ban, kick, timeout, warn con azioni automatiche, clear con filtri, segnalazioni e automod.',
  commands: ['ban', 'kick', 'timeout', 'untimeout', 'warn', 'warnazioni', 'warnings', 'clear', 'segnala', 'slowmode', 'lock', 'lockdown', 'nuke', 'unban', 'caso'],
  db: ['warnings', 'cases', 'lockdown'],
  events: [],
  handlers: [],
  ambient: ['automod in messageCreate'],
  locked: false,
};
