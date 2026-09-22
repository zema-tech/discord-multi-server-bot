'use strict';
/** src/modules/tickets.js — Controller feature Ticket e assistenza. */
module.exports = {
  id: 'tickets',
  title: 'Ticket',
  icon: 'ticket',
  section: 'Ticket & Vocali',
  description: 'Supporto organizzato con pannello, categorie e transcript.',
  commands: ['ticket', 'ticket-ai'],
  db: ['tickets'],
  events: [],
  handlers: ['ticketHandler'],
  locked: false,
  statsExtra(gid) {
    try {
      const tickets = require('../database/tickets');
      if (tickets && typeof tickets.openTickets === 'function') {
        const open = tickets.openTickets(gid);
        return { openTickets: Array.isArray(open) ? open.length : 0 };
      }
    } catch { /* health mai bloccante */ }
    return {};
  },
};
