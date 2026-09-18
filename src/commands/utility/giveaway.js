const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const { load, save, dbFile } = require('../../database/jsonDb');
let T;
try {
  T = require('../../utils/theme');
} catch {
  T = {
    COLORS: { success: 0x57f287, error: 0xed4245, primary: 0x5865f2, warn: 0xfee75c, gold: 0xffd700 },
    truncate: (s, m) => String(s ?? '').slice(0, m),
    bar: (c, mx, len = 10) => {
      const m = Math.max(1, Math.min(25, Math.floor(Number(len)) || 10));
      const r = Number(mx) > 0 ? Math.min(1, Math.max(0, Number(c) / Number(mx))) : 0;
      const f = Math.round(r * m);
      return '█'.repeat(f) + '░'.repeat(m - f);
    },
  };
}

const active = new Map(); // messageId -> { timeout, ... }

// NOTA restart-safe: i setTimeout vivono solo in memoria, quindi al restart del bot
// i giveaway attivi NON si chiudono da soli. Per permettere un futuro ripristino
// (es. un handler al ready che rilegge il file e riprogramma le scadenze),
// ogni giveaway avviato viene salvato in src/database/giveaways.json e rimosso a chiusura.
// Il ripristino automatico al boot non è ancora implementato: è solo predisposto lo storage.
const GIVEAWAYS_FILE = dbFile('giveaways');

function loadGiveaways() {
  const data = load(GIVEAWAYS_FILE);
  return data && typeof data === 'object' ? data : {};
}

function persistGiveaway(messageId, entry) {
  const all = loadGiveaways();
  all[messageId] = entry;
  save(GIVEAWAYS_FILE, all);
}

function dropGiveaway(messageId) {
  const all = loadGiveaways();
  if (all[messageId]) {
    delete all[messageId];
    save(GIVEAWAYS_FILE, all);
  }
}

function barProgress(endsAt, duration) {
  // Barra avanzamento trascorso (0 a inizio, piena a fine). Usa theme.bar con fallback inline.
  const elapsed = Number(duration) > 0 ? Number(duration) - (Number(endsAt) - Date.now()) : 0;
  try {
    return `\`[${T.bar(elapsed, duration, 10)}]\``;
  } catch {
    const ratio = duration > 0 ? Math.max(0, Math.min(1, (endsAt - Date.now()) / duration)) : 0;
    const left = Math.round(ratio * 10);
    return `\`[${'█'.repeat(10 - left)}${'░'.repeat(left)}]\``;
  }
}

function buildEmbed({ prize, winners, endsAt, startedByTag, roleId, halfTime = false, durationMs = null }) {
  const roleLine = roleId ? `\n🔒 Requisito: ruolo <@&${roleId}>` : '';
  const midLine = halfTime ? '\n⏳ **Siamo a metà tempo: reagisci ora!**' : '';
  const prog = durationMs ? `\n${barProgress(endsAt, durationMs)}` : '';
  const color = halfTime ? (T.COLORS.warn ?? 0xfee75c) : 0xeb459e;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(T.truncate(`🎉 GIVEAWAY: ${prize}`, 256))
    .setDescription(T.truncate(`🎊 **Reagisci con 🎉 per partecipare!**\n\n🏆 Vincitori: **${winners}**${roleLine}\n⏰ Termina: <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:F>)${midLine}${prog}`, 4000))
    .setFooter({ text: T.truncate(`Avviato da ${startedByTag}`, 200) })
    .setTimestamp(endsAt);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Avvia un giveaway (il bot estrae un vincitore)')
    .addStringOption((o) => o.setName('durata').setDescription('Durata: 1m, 1h, 1d').setRequired(true))
    .addStringOption((o) => o.setName('premio').setDescription('Cosa si vince').setRequired(true))
    .addIntegerOption((o) => o.setName('vincitori').setDescription('Numero vincitori (default 1)').setMinValue(1).setMaxValue(10).setRequired(false))
    .addRoleOption((o) => o.setName('ruolo').setDescription('Solo chi ha questo ruolo può vincere (opzionale)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
  cooldown: 10,
  async execute(interaction) {
    const raw = interaction.options.getString('durata');
    // Titolo embed max 256 char: l'opzione slash non ha maxLength, tronco per non far fallire l'invio.
    const prize = String(interaction.options.getString('premio') || '').slice(0, 200) || 'Premio';
    const winners = interaction.options.getInteger('vincitori') ?? 1;
    const role = interaction.options.getRole('ruolo') ?? null;
    const duration = ms(raw);
    if (!duration || duration < 10000 || duration > 7 * 24 * 3600 * 1000)
      return interaction.reply({ content: '❌ Durata non valida (min 10s, max 7g). Esempi: `10m`, `2h`, `1d`.', flags: MessageFlags.Ephemeral });

    const endsAt = Date.now() + duration;
    const embed = buildEmbed({ prize, winners, endsAt, startedByTag: interaction.user.tag, roleId: role?.id ?? null, durationMs: duration });
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    // Senza permesso "Aggiungi reazioni" il giveaway nascerebbe morto: errore chiaro invece di crash.
    try {
      await message.react('🎉');
    } catch {
      return interaction.followUp({ content: '❌ Non ho il permesso di aggiungere reazioni in questo canale: giveaway annullato.', flags: MessageFlags.Ephemeral });
    }

    // Salva per futuro ripristino dopo restart (vedi NOTA in alto).
    persistGiveaway(message.id, {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: message.id,
      prize,
      winners,
      endsAt,
      roleId: role?.id ?? null,
      startedBy: interaction.user.tag,
    });

    // Embed live: un solo edit a metà tempo (countdown testuale, niente spam di edit).
    // NOTA: niente unref() sui timer — con unref il processo potrebbe uscire prima
    // della scadenza (durate fino a 7g). Il gateway Discord tiene comunque vivo il loop.
    let halfTimer = null;
    if (duration >= 20000) {
      halfTimer = setTimeout(() => {
        message.edit({ embeds: [buildEmbed({ prize, winners, endsAt, startedByTag: interaction.user.tag, roleId: role?.id ?? null, halfTime: true, durationMs: duration })] }).catch(() => {});
      }, Math.floor(duration / 2));
    }

    const timeout = setTimeout(async () => {
      try {
        const fresh = await message.fetch().catch(() => null);
        if (!fresh) return;
        const reaction = fresh.reactions.cache.get('🎉');
        // Discord restituisce max ~100 utenti per fetch: limite documentato, niente paginazione (minimo).
        let users = reaction ? (await reaction.users.fetch({ limit: 100 }).catch(() => new Map())).filter((u) => !u.bot) : new Map();
        // Filtro ruolo minimo: solo chi ha il ruolo può vincere (cache prima, poi fetch).
        if (role && users.size) {
          const eligible = [];
          for (const u of users.values()) {
            const member = interaction.guild?.members?.cache?.get(u.id) ?? await interaction.guild.members.fetch(u.id).catch(() => null);
            if (member && member.roles.cache.has(role.id)) eligible.push(u);
          }
          users = new Map(eligible.map((u) => [u.id, u]));
        }
        if (!users.size) {
          await message.reply(role ? '😢 Giveaway terminato: nessun partecipante con il ruolo richiesto.' : '😢 Giveaway terminato: nessun partecipante.');
          return;
        }
        const arr = [...users.values()];
        const picked = [];
        for (let i = 0; i < Math.min(winners, arr.length); i++) {
          picked.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
        }
        const totalEntries = users.size;
        const winEmbed = new EmbedBuilder()
          .setColor(T.COLORS.gold ?? 0xffd700)
          .setTitle(T.truncate('🎉 GIVEAWAY TERMINATO!', 256))
          .setDescription(T.truncate(`🏆 **Premio: ${prize}**\n\n👑 **Vincitore${picked.length > 1 ? 'i' : ''}:** ${picked.join(', ')} 🎊\n\n👥 Partecipanti: **${totalEntries}** • 🎟️ Estratti: **${picked.length}/${winners}**`, 4000))
          .setFooter({ text: T.truncate(`Giveaway avviato da ${interaction.user.tag}`, 200) })
          .setTimestamp();
        await message.reply({ embeds: [winEmbed], content: `🎉 ${picked.join(' ')} congratulazioni!` }).catch(() => message.channel.send({ embeds: [winEmbed] }).catch(() => {}));
      } catch (e) {
        console.error('giveaway end:', e.message);
      } finally {
        try { if (halfTimer) clearTimeout(halfTimer); } catch { /* ignora */ }
        active.delete(message.id);
        dropGiveaway(message.id);
      }
    }, duration);
    active.set(message.id, { timeout, halfTimer });
  },
};
