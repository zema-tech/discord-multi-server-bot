'use strict';
/** src/locales/en.js — English strings. Falls back to IT per-key via t(). */

module.exports = {
  common: {
    noPerms: '❌ You need the Manage Server permission to use this command.',
    guildOnly: '❌ Use this command inside a server.',
    ok: '✅',
    cancel: '❌',
    yes: 'Yes',
    no: 'No',
    requestedBy: 'Requested by {tag}',
  },

  lingua: {
    title: '🌐 Bot language',
    current: 'Current language: **{label}** (`{lang}`).',
    hint: 'Use `/lingua imposta` to change it.',
    set: '✅ Language set to **{label}** (`{lang}`).',
    invalid: '❌ Invalid language: `{value}`. Use `it` or `en`.',
    labelIt: 'Italiano 🇮🇹',
    labelEn: 'English 🇬🇧',
  },

  ping: {
    measuring: '🏓 Pong! *measuring latency…*',
    title: '🏓 Pong!',
    body: '📡 **Round-trip:** **{rtt}ms**\n{rttBar}\n💓 **WebSocket:** **{ws}ms**\n{wsBar}\n⏱️ **Uptime:** {uptime}',
  },

  help: {
    title: '📚 Commands — {name}',
    description: '✨ **{count} commands** across **{servers}** servers\n_Pick a category below: every row is ready to copy!_',
    footerWith: 'Use /setup to configure the server • Dashboard: {baseUrl}',
    footerDefault: 'Use /setup to configure welcome, log and automod',
    emptyField: '—',
    unknownCategory: '📌 {cat}',
    categories: {
      moderation: '🛡️ Moderation',
      fun: '🎮 Fun',
      economy: '💰 Economy',
      utility: '🔧 Utility',
      levels: '⭐ Levels',
      tickets: '🎫 Tickets',
      ai: '🤖 AI',
      music: '🎵 Music',
      altri: '📌 Other',
    },
  },

  serverinfo: {
    description: '✨ **Boost level {tier}** {bar} `{boosts}/14`\n👑 Owner: <@{ownerId}> • 🆔 `{id}`',
    footer: '{name} • ID {id}',
    fields: {
      members: '👥 Members',
      channels: '💬 Channels',
      roles: '🎭 Roles',
      emoji: '😀 Emoji / Stickers',
      boost: '🚀 Boost',
      created: '📅 Created',
    },
    values: {
      members: '**{count}**',
      roles: '**{count}**',
      channels: 'Text **{text}** • Voice **{voice}**\nCategories **{cats}**',
      channelsThreads: 'Text **{text}** • Voice **{voice}**\nCategories **{cats}** • Threads **{threads}**',
      emoji: 'Emoji **{emoji}** • Stickers **{stickers}**',
      boost: 'Level **{tier}** ({boosts} boosts)',
      created: '<t:{ts}:D> (<t:{ts}:R>)',
    },
  },

  userinfo: {
    title: '👤 {tag}',
    memberFallback: '👤 Member',
    noRoles: 'None',
    footer: '{tag} • {id}',
    badges: {
      owner: '👑 Owner',
      bot: '🤖 Bot',
      booster: '💎 Booster',
      admin: '🛡️ Admin',
      staff: '🧰 Staff',
    },
    fields: {
      id: '🆔 ID',
      bot: '🤖 Bot',
      accountCreated: '📅 Account created',
      joined: '📥 Joined the server',
      topRole: '🎭 Top role',
      roles: '🎭 Roles ({count})',
      boostSince: '💎 Boosting since',
    },
    values: {
      dates: '<t:{ts}:D> (<t:{ts}:R>)',
      joined: '<t:{ts}:D> (<t:{ts}:R>)',
      joinedWithPos: '<t:{ts}:D> (<t:{ts}:R>)\n🏅 Join position: **{pos}**',
      boostSince: '<t:{ts}:R>',
    },
  },

  avatar: {
    title: '🖼️ {tag}\u2019s avatar',
    description: '🔗 [Open original]({url})\n🆔 `{id}` • {kind}',
    kindBot: '🤖 Bot',
    kindUser: '👤 User',
  },

  eightball: {
    title: '🎱 Magic 8-Ball',
    question: '❓ Question',
    answer: '🔮 Answer',
    noQuestion: '(no question)',
    answerValue: '**{answer}**',
    answers: [
      'Yes, absolutely.',
      'It is decidedly so.',
      'Without a doubt.',
      'Yes, definitely.',
      'You may rely on it.',
      'As I see it, yes.',
      'Most likely.',
      'Outlook good.',
      'Yes.',
      'Signs point to yes.',
      'Reply hazy, try again.',
      'Ask again later.',
      'Better not tell you now.',
      'Cannot predict now.',
      'Concentrate and ask again.',
      'Don\u2019t count on it.',
      'My reply is no.',
      'My sources say no.',
      'Outlook not so good.',
      'Very doubtful.',
    ],
  },
};
