const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Cancella messaggi (max 100, solo ultimi 14 giorni)')
    .addIntegerOption((o) => o.setName('quantita').setDescription('Numero di messaggi (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('utente').setDescription('Cancella solo i messaggi di questo utente').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const qty = interaction.options.getInteger('quantita');
    const user = interaction.options.getUser('utente');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      let messages = await interaction.channel.messages.fetch({ limit: user ? 100 : qty });
      if (user) messages = messages.filter((m) => m.author.id === user.id).first(qty);
      const deleted = await interaction.channel.bulkDelete(messages, true);
      await interaction.editReply(`🧹 Cancellati **${deleted.size}** messaggi${user ? ` di ${user.tag}` : ''}.`);
    } catch (e) {
      console.error(e);
      await interaction.editReply('❌ Impossibile cancellare (messaggi più vecchi di 14 giorni non si possono eliminare in blocco).');
    }
  },
};
