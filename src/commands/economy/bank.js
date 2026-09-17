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
    const balance = Number.isFinite(u.balance) ? u.balance : 0;
    const bank = Number.isFinite(u.bank) ? u.bank : 0;
    const fmt = (n) => n.toLocaleString('it-IT');

    const scheda = (titolo, emoji, testo) => new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${emoji} ${titolo}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(testo)
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();

    if (sub === 'deposita') {
      if (balance < amount) return interaction.reply({ content: '❌ Fondi insufficienti nel portafoglio.', flags: MessageFlags.Ephemeral });
      updateUser(gid, uid, { balance: balance - amount, bank: bank + amount });
      return interaction.reply({
        embeds: [scheda('Deposito in banca', '🏦', `Depositati **${fmt(amount)}** 🪙 al sicuro dai furti!\n👛 Portafoglio: **${fmt(balance - amount)}** 🪙\n🏦 Banca: **${fmt(bank + amount)}** 🪙`)],
      });
    }
    if (bank < amount) return interaction.reply({ content: '❌ Fondi insufficienti in banca.', flags: MessageFlags.Ephemeral });
    updateUser(gid, uid, { balance: balance + amount, bank: bank - amount });
    await interaction.reply({
      embeds: [scheda('Prelievo dalla banca', '👛', `Prelevati **${fmt(amount)}** 🪙 dalla banca.\n👛 Portafoglio: **${fmt(balance + amount)}** 🪙\n🏦 Banca: **${fmt(bank - amount)}** 🪙`)],
    });
  },
};
