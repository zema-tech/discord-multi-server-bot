const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');

const active = new Map(); // messageId -> { timeout, ... }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Avvia un giveaway (il bot estrae un vincitore)')
    .addStringOption((o) => o.setName('durata').setDescription('Durata: 1m, 1h, 1d').setRequired(true))
    .addStringOption((o) => o.setName('premio').setDescription('Cosa si vince').setRequired(true))
    .addIntegerOption((o) => o.setName('vincitori').setDescription('Numero vincitori (default 1)').setMinValue(1).setMaxValue(10).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
  cooldown: 10,
  async execute(interaction) {
    const raw = interaction.options.getString('durata');
    const prize = interaction.options.getString('premio');
    const winners = interaction.options.getInteger('vincitori') ?? 1;
    const duration = ms(raw);
    if (!duration || duration < 10000 || duration > 7 * 24 * 3600 * 1000)
      return interaction.reply({ content: '❌ Durata non valida (min 10s, max 7g). Esempi: `10m`, `2h`, `1d`.', flags: MessageFlags.Ephemeral });

    const endsAt = Date.now() + duration;
    const embed = new EmbedBuilder()
      .setColor(0xeb459e)
      .setTitle(`🎉 GIVEAWAY: ${prize}`)
      .setDescription(`Reagisci con 🎉 per partecipare!\nVincitori: **${winners}**\nTermina: <t:${Math.floor(endsAt / 1000)}:R>`)
      .setFooter({ text: `Avviato da ${interaction.user.tag}` })
      .setTimestamp(endsAt);
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    await message.react('🎉');

    const timeout = setTimeout(async () => {
      try {
        const fresh = await message.fetch();
        const reaction = fresh.reactions.cache.get('🎉');
        const users = reaction ? (await reaction.users.fetch()).filter((u) => !u.bot) : new Map();
        if (!users.size) {
          await message.reply('😢 Giveaway terminato: nessun partecipante.');
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
      }
    }, duration);
    active.set(message.id, { timeout });
    timeout.unref?.();
  },
};
