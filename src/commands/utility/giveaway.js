const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const { load, save, dbFile } = require('../../database/jsonDb');

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
  const ratio = duration > 0 ? Math.max(0, Math.min(1, (endsAt - Date.now()) / duration)) : 0;
  const left = Math.round(ratio * 10);
  return `\`[${'█'.repeat(10 - left)}${'░'.repeat(left)}]\``;
}

function buildEmbed({ prize, winners, endsAt, startedByTag, roleId, halfTime = false, durationMs = null }) {
  const roleLine = roleId ? `\n🔒 Requisito: ruolo <@&${roleId}>` : '';
  const midLine = halfTime ? '\n⏳ **Siamo a metà tempo: reagisci ora!**' : '';
  const prog = durationMs ? `\n${barProgress(endsAt, durationMs)}` : '';
  return new EmbedBuilder()
    .setColor(halfTime ? 0xfee75c : 0xeb459e)
    .setTitle(`🎉 GIVEAWAY: ${prize}`.slice(0, 256))
    .setDescription(`🎊 **Reagisci con 🎉 per partecipare!**\n\n🏆 Vincitori: **${winners}**${roleLine}\n⏰ Termina: <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:F>)${midLine}${prog}`.slice(0, 4000))
    .setFooter({ text: `Avviato da ${startedByTag}`.slice(0, 200) })
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
    if (duration >= 20000) {
      const halfTimer = setTimeout(() => {
        message.edit({ embeds: [buildEmbed({ prize, winners, endsAt, startedByTag: interaction.user.tag, roleId: role?.id ?? null, halfTime: true, durationMs: duration })] }).catch(() => {});
      }, Math.floor(duration / 2));
      halfTimer.unref?.();
    }

    const timeout = setTimeout(async () => {
      try {
        const fresh = await message.fetch();
        const reaction = fresh.reactions.cache.get('🎉');
        let users = reaction ? (await reaction.users.fetch()).filter((u) => !u.bot) : new Map();
        // Filtro ruolo minimo: solo chi ha il ruolo può vincere.
        if (role && users.size) {
          const eligible = [];
          for (const u of users.values()) {
            const member = await interaction.guild.members.fetch(u.id).catch(() => null);
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
          .setColor(0xffd700)
          .setTitle('🎉 GIVEAWAY TERMINATO!'.slice(0, 256))
          .setDescription(`🏆 **Premio: ${prize}**\n\n👑 **Vincitore${picked.length > 1 ? 'i' : ''}:** ${picked.join(', ')} 🎊\n\n👥 Partecipanti: **${totalEntries}** • 🎟️ Estratti: **${picked.length}/${winners}**`.slice(0, 4000))
          .setFooter({ text: `Giveaway avviato da ${interaction.user.tag}`.slice(0, 200) })
          .setTimestamp();
        await message.reply({ embeds: [winEmbed], content: `🎉 ${picked.join(' ')} congratulazioni!` }).catch(() => message.channel.send({ embeds: [winEmbed] }).catch(() => {}));
      } catch (e) {
        console.error('giveaway end:', e.message);
      } finally {
        active.delete(message.id);
        dropGiveaway(message.id);
      }
    }, duration);
    active.set(message.id, { timeout });
    timeout.unref?.();
  },
};
