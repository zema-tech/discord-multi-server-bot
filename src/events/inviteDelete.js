/**
 * inviteDelete — rimuove il codice dalla cache inviti (vedi `database/invites.js`).
 * Nessun fetch massivo qui: solo rimozione incrementale.
 */
const { Events } = require('discord.js');
const { removeInvite } = require('../database/invites');

module.exports = {
  name: Events.InviteDelete,
  async execute(invite, client) {
    try {
      if (!invite?.guild || !invite?.code) return;
      removeInvite(invite.guild.id, invite.code);
    } catch (e) {
      console.error('inviteDelete:', e.message);
    }
  },
};
