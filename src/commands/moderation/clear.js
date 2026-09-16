const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Cancella un certo numero di messaggi')
    .addIntegerOption(option =>
      option.setName('quantita')
        .setDescription('Numero di messaggi da cancellare (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    const amount = interaction.options.getInteger('quantita');

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      await interaction.reply({
        content: `🧹 Cancellati **${deleted.size}** messaggi.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'Non sono riuscito a cancellare i messaggi. Assicurati che non siano più vecchi di 14 giorni.',
        ephemeral: true,
      });
    }
  },
};
