/**
 * inviteCreate — aggiorna incrementalmente la cache inviti (vedi `database/invites.js`).
 * Nessun fetch massivo qui: solo upsert del nuovo codice.
 */
const { Events } = require('discord.js');
const { upsertInvite } = require('../database/invites');

module.exports = {
  name: Events.InviteCreate,
  async execute(invite, client) {
    try {
      if (!invite?.guild || !invite?.code) return;
      upsertInvite(invite.guild.id, invite.code, {
        uses: invite.uses ?? 0,
        inviterId: invite.inviter?.id ?? null,
      });
    } catch (e) {
      console.error('inviteCreate:', e.message);
    }
  },
};
