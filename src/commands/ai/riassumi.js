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

    const partecipanti = new Set();
    const righe = [...messages.values()]
      .reverse()
      .map((m) => {
        const autore = m.author ? m.author.username : 'Sconosciuto';
        const contenuto = String(m.content || '').trim();
        if (!contenuto) return '';
        if (m.author && m.author.id) partecipanti.add(m.author.id);
        else partecipanti.add(`nome:${autore}`);
        return `${autore}: ${contenuto}`;
      })
      .filter(Boolean);

    if (righe.length < 3) {
      await interaction.editReply('ℹ️ Niente da riassumere: servono almeno 3 messaggi di testo nel canale.');
      return;
    }

    const nomi = [...messages.values()]
      .map((m) => (m.author ? m.author.username : null))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 20)
      .join(', ');
    const conversazione = righe.join('\n').slice(0, MAX_CONVERSATION_CHARS);
    const prompt =
      `Riassumi questa conversazione del canale.\n` +
      `Partecipanti (${partecipanti.size}): ${nomi || 'sconosciuti'}\n` +
      `Messaggi di testo: ${righe.length}\n${conversazione}`;

    let riassunto;
    try {
      riassunto = await askAI(prompt, SYSTEM_PROMPT);
    } catch (err) {
      await interaction.editReply(`⚠️ ${err?.message || 'AI non disponibile, riprova più tardi.'}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📝 Riassunto ultimi ${righe.length} messaggi`)
      .addFields({ name: '👥 Partecipanti', value: `${partecipanti.size}`, inline: true })
      .setDescription(riassunto.slice(0, 4096))
      .setFooter({ text: `Richiesto da ${interaction.user.username} • powered by AI gratuita` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
