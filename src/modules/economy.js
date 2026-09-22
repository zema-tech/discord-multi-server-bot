'use strict';
/** src/modules/economy.js — Controller feature Economia (monete, shop, giochi). */
module.exports = {
  id: 'economy',
  title: 'Economia',
  icon: 'cart',
  section: 'Economia',
  description: 'Monete, banca, lavoro giornaliero, shop ruoli, lotteria e giochi.',
  commands: ['balance', 'bank', 'daily', 'pay', 'rob', 'work', 'slots', 'shop', 'lotteria', 'rep', 'leaderboard'],
  db: ['economy', 'shop', 'lotteria', 'rep'],
  events: [],
  handlers: [],
  locked: false,
};
