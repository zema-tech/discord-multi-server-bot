const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI } = require('../../utils/ai');

const SYSTEM_PROMPT = 'Sei un assistente utile del server Discord, rispondi in italiano, conciso (max 1500 caratteri)';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chiedi')
    .setDescription('Fai una domanda all\u2019AI del server')
    .addStringOption((option) =>
      option.setName('domanda').setDescription('La domanda da fare all\u2019AI').setRequired(true)
    ),
  cooldown: 15,
  async execute(interaction) {
    const domanda = interaction.options.getString('domanda', true);

    await interaction.deferReply();

    let risposta;
    try {
      risposta = await askAI(domanda, SYSTEM_PROMPT);
    } catch {
      await interaction.editReply('⚠️ AI non disponibile, riprova più tardi.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤖 Risposta AI')
      .addFields({ name: '❓ Domanda', value: domanda.slice(0, 1024) })
      .setDescription(risposta.slice(0, 4096))
      .setFooter({ text: `Richiesto da ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
