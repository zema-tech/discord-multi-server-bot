const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const MEMES = [
  'https://i.imgflip.com/30b1gx.jpg', 'https://i.imgflip.com/1bij.jpg', 'https://i.imgflip.com/26am.jpg',
  'https://i.imgflip.com/9ehk.jpg', 'https://i.imgflip.com/3si4.jpg', 'https://i.imgflip.com/2fm6x.jpg',
  'https://i.imgflip.com/1otk96.jpg', 'https://i.imgflip.com/1ihzfe.jpg', 'https://i.imgflip.com/4t0m5.jpg',
  'https://i.imgflip.com/5o32tt.jpg', 'https://i.imgflip.com/65ex.jpg', 'https://i.imgflip.com/1bhk.jpg',
];

const CAPTIONS = [
  'Quando il codice funziona al primo colpo 😱', 'Io che spiego al PC cosa deve fare', 'POV: è lunedì mattina',
  'Quando dici "ultima partita" alle 3 di notte', 'Il mio cervello durante un esame', 'Quando il WiFi cade in call',
];

module.exports = {
  data: new SlashCommandBuilder().setName('meme').setDescription('Genera un meme casuale'),
  cooldown: 3,
  async execute(interaction) {
    const img = MEMES[Math.floor(Math.random() * MEMES.length)];
    const cap = CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)];
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`😂 ${cap}`.slice(0, 256))
      .setThumbnail(interaction.user.displayAvatarURL())
      .setImage(img)
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
