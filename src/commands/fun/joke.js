const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const JOKES = [
  'Perché i programmatori confondono Halloween e Natale? Perché OCT 31 == DEC 25.',
  'Cosa fa un JavaScript developer quando ha freddo? Chiude le finestre.',
  'Perché il database ha lasciato la fidanzata? Aveva troppe relazioni.',
  'Come si chiama un pesce senza occhi?... "sh".',
  'Cosa dice un bit all\'altro? "Ci vediamo al bus".',
  'Perché non si raccontano barzellette ai firewall? Le bloccano tutte.',
  'Qual è il colmo per un elettricista? Non essere illuminato.',
  'Cosa fa una mucca con il cellulare? Moo-bile banking.',
  'Perché gli scheletri non litigano mai? Non hanno stomaco.',
  'Che cos\'è un gatto che programma? Un... purr-grammatore.',
  'Perché il computer è andato dal dottore? Aveva un virus!',
  'Cosa ordina un programmatore al bar? Una birra... e poi altre 255.',
];

module.exports = {
  data: new SlashCommandBuilder().setName('joke').setDescription('Racconta una barzelletta'),
  cooldown: 3,
  async execute(interaction) {
    const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
    const embed = new EmbedBuilder().setColor(0xfee75c).setTitle('😂 Barzelletta').setDescription(joke).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
