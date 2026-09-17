'use strict';
/** src/locales/it.js — stringhe italiane (default, fallback). CommonJS. */

module.exports = {
  common: {
    noPerms: '❌ Ti serve il permesso Gestione Server per usare questo comando.',
    guildOnly: '❌ Usa questo comando dentro un server.',
    ok: '✅',
    cancel: '❌',
    yes: 'Sì',
    no: 'No',
    requestedBy: 'Richiesto da {tag}',
  },

  lingua: {
    title: '🌐 Lingua del bot',
    current: 'Lingua attuale: **{label}** (`{lang}`).',
    hint: 'Usa `/lingua imposta` per cambiarla.',
    set: '✅ Lingua impostata su **{label}** (`{lang}`).',
    invalid: '❌ Lingua non valida: `{value}`. Usa `it` o `en`.',
    labelIt: 'Italiano 🇮🇹',
    labelEn: 'English 🇬🇧',
  },

  ping: {
    measuring: '🏓 Pong! *misuro la latenza…*',
    title: '🏓 Pong!',
    body: '📡 **Round-trip:** **{rtt}ms**\n{rttBar}\n💓 **WebSocket:** **{ws}ms**\n{wsBar}\n⏱️ **Uptime:** {uptime}',
  },

  help: {
    title: '📚 Comandi — {name}',
    description: '✨ **{count} comandi** su **{servers}** server\n_Scegli una categoria qui sotto: ogni riga è pronta da copiare!_',
    footerWith: 'Usa /setup per configurare il server • Dashboard: {baseUrl}',
    footerDefault: 'Usa /setup per configurare welcome, log e automod',
    emptyField: '—',
    unknownCategory: '📌 {cat}',
    categories: {
      moderation: '🛡️ Moderazione',
      fun: '🎮 Divertimento',
      economy: '💰 Economia',
      utility: '🔧 Utility',
      levels: '⭐ Livelli',
      tickets: '🎫 Ticket',
      ai: '🤖 AI',
      music: '🎵 Musica',
      altri: '📌 Altri',
    },
  },

  serverinfo: {
    description: '✨ **Livello boost {tier}** {bar} `{boosts}/14`\n👑 Proprietario: <@{ownerId}> • 🆔 `{id}`',
    footer: '{name} • ID {id}',
    fields: {
      members: '👥 Membri',
      channels: '💬 Canali',
      roles: '🎭 Ruoli',
      emoji: '😀 Emoji / Sticker',
      boost: '🚀 Boost',
      created: '📅 Creato',
    },
    values: {
      members: '**{count}**',
      roles: '**{count}**',
      channels: 'Testuali **{text}** • Vocali **{voice}**\nCategorie **{cats}**',
      channelsThreads: 'Testuali **{text}** • Vocali **{voice}**\nCategorie **{cats}** • Thread **{threads}**',
      emoji: 'Emoji **{emoji}** • Sticker **{stickers}**',
      boost: 'Livello **{tier}** ({boosts} boost)',
      created: '<t:{ts}:D> (<t:{ts}:R>)',
    },
  },

  userinfo: {
    title: '👤 {tag}',
    memberFallback: '👤 Membro',
    noRoles: 'Nessuno',
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
      accountCreated: '📅 Account creato',
      joined: '📥 Entrato nel server',
      topRole: '🎭 Ruolo principale',
      roles: '🎭 Ruoli ({count})',
      boostSince: '💎 Boost dal',
    },
    values: {
      dates: '<t:{ts}:D> (<t:{ts}:R>)',
      joined: '<t:{ts}:D> (<t:{ts}:R>)',
      joinedWithPos: '<t:{ts}:D> (<t:{ts}:R>)\n🏅 Posizione d\u2019ingresso: **{pos}**',
      boostSince: '<t:{ts}:R>',
    },
  },

  avatar: {
    title: '🖼️ Avatar di {tag}',
    description: '🔗 [Apri originale]({url})\n🆔 `{id}` • {kind}',
    kindBot: '🤖 Bot',
    kindUser: '👤 Utente',
  },

  eightball: {
    title: '🎱 Palla Magica 8',
    question: '❓ Domanda',
    answer: '🔮 Risposta',
    noQuestion: '(nessuna domanda)',
    answerValue: '**{answer}**',
    answers: [
      'Sì, assolutamente.',
      'È deciso così.',
      'Senza dubbio.',
      'Sì, decisamente.',
      'Puoi contarci.',
      'Come la vedo io, sì.',
      'Molto probabilmente.',
      'Le prospettive sono buone.',
      'Sì.',
      'I segnali puntano al sì.',
      'Risposta confusa, riprova.',
      'Chiedi più tardi.',
      'Meglio non dirtelo ora.',
      'Non posso prevederlo ora.',
      'Concentrati e riprova.',
      'Non contarci.',
      'La mia risposta è no.',
      'Le mie fonti dicono no.',
      'Le prospettive non sono così buone.',
      'Molto dubbioso.',
    ],
  },
};
