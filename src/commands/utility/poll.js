const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea un sondaggio con reazioni')
    .addStringOption((o) => o.setName('domanda').setDescription('La domanda del sondaggio').setRequired(true))
    .addStringOption((o) => o.setName('opzioni').setDescription('Opzioni separate da | (max 10, default Sì/No)').setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const question = interaction.options.getString('domanda');
    const raw = interaction.options.getString('opzioni');
    const options = raw ? raw.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 10) : ['Sì', 'No'];
    if (options.length < 2) return interaction.reply({ content: '❌ Servono almeno 2 opzioni.', flags: MessageFlags.Ephemeral });

    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const desc = options.map((o, i) => `${emoji[i]} ${o}`).join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ${question}`)
      .setDescription(desc)
      .setFooter({ text: `Sondaggio di ${interaction.user.tag}` })
      .setTimestamp();
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    for (let i = 0; i < options.length; i++) await message.react(emoji[i]);
  },
};
