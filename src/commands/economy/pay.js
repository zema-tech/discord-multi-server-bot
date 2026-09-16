const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Invia monete a un altro utente')
    .addUserOption((o) => o.setName('utente').setDescription('Destinatario').setRequired(true))
    .addIntegerOption((o) => o.setName('importo').setDescription('Quantità').setRequired(true).setMinValue(1)),
  cooldown: 5,
  async execute(interaction) {
    const target = interaction.options.getUser('utente');
    const amount = interaction.options.getInteger('importo');
    if (target.bot) return interaction.reply({ content: '❌ Non puoi pagare un bot.', flags: MessageFlags.Ephemeral });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Non puoi pagare te stesso.', flags: MessageFlags.Ephemeral });

    const sender = getUser(interaction.guild.id, interaction.user.id);
    // Saldo corrotto (NaN): blocca invece di regalare soldi dal nulla
    if (!Number.isFinite(sender.balance) || sender.balance < amount)
      return interaction.reply({ content: `❌ Saldo insufficiente (hai **${Number.isFinite(sender.balance) ? sender.balance : 0}** 🪙).`, flags: MessageFlags.Ephemeral });

    addBalance(interaction.guild.id, interaction.user.id, -amount);
    addBalance(interaction.guild.id, target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('💸 Pagamento inviato')
      .setDescription(`${interaction.user} ha inviato **${amount}** 🪙 a ${target}`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
