const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI } = require('../../utils/ai');

const SYSTEM_PROMPT =
  'Sei un assistente utile del server Discord. Riassumi la conversazione in italiano con un elenco puntato, conciso (max 1500 caratteri). Ignora spam e messaggi vuoti.';
const MAX_CONVERSATION_CHARS = 4000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('riassumi')
    .setDescription('Riassume gli ultimi messaggi del canale con l\u2019AI')
    .addIntegerOption((option) =>
      option
        .setName('quantita')
        .setDescription('Numero di messaggi da riassumere (5-50)')
        .setMinValue(5)
        .setMaxValue(50)
    ),
  cooldown: 30,
  async execute(interaction) {
    const quantita = interaction.options.getInteger('quantita') || 20;

    await interaction.deferReply();

    let messages;
    try {
      messages = await interaction.channel.messages.fetch({ limit: quantita });
    } catch {
      await interaction.editReply('❌ Impossibile leggere i messaggi del canale.');
      return;
    }

    const righe = [...messages.values()]
      .reverse()
      .map((m) => {
        const autore = m.author ? m.author.username : 'Sconosciuto';
        const contenuto = String(m.content || '').trim();
        return contenuto ? `${autore}: ${contenuto}` : '';
      })
      .filter(Boolean);

    if (righe.length === 0) {
      await interaction.editReply('❌ Nessun messaggio di testo da riassumere nel canale.');
      return;
    }

    const conversazione = righe.join('\n').slice(0, MAX_CONVERSATION_CHARS);
    const prompt = `Riassumi questa conversazione del canale:\n${conversazione}`;

    let riassunto;
    try {
      riassunto = await askAI(prompt, SYSTEM_PROMPT);
    } catch {
      await interaction.editReply('⚠️ AI non disponibile, riprova più tardi.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📝 Riassunto ultimi ${righe.length} messaggi`)
      .setDescription(riassunto.slice(0, 4096))
      .setFooter({ text: `Richiesto da ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
