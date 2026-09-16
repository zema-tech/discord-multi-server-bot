const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const risposte = [
  'Sì, assolutamente.',
  'È deciso così.',
  'Senza dubbio.',
  'Sì, decisamente.',
  'Puoi contarci.',
  'Come la vedo io, sì.',
  'Molto probabilmente.',
  'Le prospettive sono buone.',
  'Sì.',
  'I segnali puntano al sì.',
  'Risposta confusa, riprova.',
  'Chiedi più tardi.',
  'Meglio non dirtelo ora.',
  'Non posso prevederlo ora.',
  'Concentrati e riprova.',
  'Non contarci.',
  'La mia risposta è no.',
  'Le mie fonti dicono no.',
  'Le prospettive non sono così buone.',
  'Molto dubbioso.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Chiedi qualcosa alla palla magica 8')
    .addStringOption(option =>
      option.setName('domanda')
        .setDescription('La tua domanda')
        .setRequired(true)
    ),
  cooldown: 3,
  async execute(interaction) {
    const domanda = interaction.options.getString('domanda');
    const risposta = risposte[Math.floor(Math.random() * risposte.length)];

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('🎱 Palla Magica 8')
      .addFields(
        // Limite field Discord 1024 char: domande lunghe crasherebbero l'invio.
        { name: 'Domanda', value: String(domanda || '').slice(0, 1024) || '(nessuna domanda)' },
        { name: 'Risposta', value: risposta }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed] });
  },
};
