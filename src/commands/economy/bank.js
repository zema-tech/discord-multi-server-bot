const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, updateUser, addBalance } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Gestisci la banca (al sicuro dai furti)')
    .addSubcommand((s) => s.setName('deposita').setDescription('Deposita monete in banca').addIntegerOption((o) => o.setName('importo').setDescription('Quantità').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('preleva').setDescription('Preleva monete dalla banca').addIntegerOption((o) => o.setName('importo').setDescription('Quantità').setRequired(true).setMinValue(1))),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const amount = interaction.options.getInteger('importo');
    const gid = interaction.guild.id;
    const uid = interaction.user.id;
    const u = getUser(gid, uid);

    if (sub === 'deposita') {
      if (u.balance < amount) return interaction.reply({ content: '❌ Fondi insufficienti nel portafoglio.', flags: MessageFlags.Ephemeral });
      updateUser(gid, uid, { balance: u.balance - amount, bank: (u.bank || 0) + amount });
      return interaction.reply(`🏦 Depositati **${amount}** 🪙 in banca.`);
    }
    if ((u.bank || 0) < amount) return interaction.reply({ content: '❌ Fondi insufficienti in banca.', flags: MessageFlags.Ephemeral });
    updateUser(gid, uid, { balance: u.balance + amount, bank: u.bank - amount });
    await interaction.reply(`👛 Prelevati **${amount}** 🪙 dalla banca.`);
  },
};
