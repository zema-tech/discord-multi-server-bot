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

function buildEmbed({ prize, winners, endsAt, startedByTag, roleId, halfTime = false }) {
  const roleLine = roleId ? `\nRequisito: ruolo <@&${roleId}>` : '';
  const midLine = halfTime ? '\n⏳ Siamo a metà tempo: reagisci ora!' : '';
  return new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`🎉 GIVEAWAY: ${prize}`)
    .setDescription(`Reagisci con 🎉 per partecipare!\nVincitori: **${winners}**${roleLine}\nTermina: <t:${Math.floor(endsAt / 1000)}:R>${midLine}`)
    .setFooter({ text: `Avviato da ${startedByTag}` })
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
    const prize = interaction.options.getString('premio');
    const winners = interaction.options.getInteger('vincitori') ?? 1;
    const role = interaction.options.getRole('ruolo') ?? null;
    const duration = ms(raw);
    if (!duration || duration < 10000 || duration > 7 * 24 * 3600 * 1000)
      return interaction.reply({ content: '❌ Durata non valida (min 10s, max 7g). Esempi: `10m`, `2h`, `1d`.', flags: MessageFlags.Ephemeral });

    const endsAt = Date.now() + duration;
    const embed = buildEmbed({ prize, winners, endsAt, startedByTag: interaction.user.tag, roleId: role?.id ?? null });
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    await message.react('🎉');

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
        message.edit({ embeds: [buildEmbed({ prize, winners, endsAt, startedByTag: interaction.user.tag, roleId: role?.id ?? null, halfTime: true })] }).catch(() => {});
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
        await message.reply(`🎉 **GIVEAWAY TERMINATO!** Premio: **${prize}**\nVincitori: ${picked.join(', ')} 🎊`);
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
