const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Mostra l'avatar di un utente")
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🖼️ Avatar di ${user.tag}`.slice(0, 256))
      .setDescription(`🔗 [Apri originale](${url})\n🆔 \`${user.id}\` • ${user.bot ? '🤖 Bot' : '👤 Utente'}`)
      .setImage(url)
      .setFooter({ text: `Richiesto da ${interaction.user.tag}`.slice(0, 200) })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
