const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
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

    // Solo spazi: askAI la rifiuterebbe con un generico "AI non disponibile", meglio un errore chiaro.
    if (!domanda.trim()) {
      return interaction.reply({ content: '❌ La domanda non può essere vuota.', flags: MessageFlags.Ephemeral });
    }

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
