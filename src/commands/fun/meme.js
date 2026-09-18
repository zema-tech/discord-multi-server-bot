const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

let _theme = null;
try {
  _theme = require('../../utils/theme');
} catch {
  _theme = null;
}
const BLUE = _theme?.COLORS?.blue ?? 0x3498db;
const applyFooter = _theme?.applyFooter ?? ((e, i) => {
  try {
    e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` });
    e.setTimestamp();
  } catch { /* ignora */ }
  return e;
});
const truncate = _theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

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
    if (!Array.isArray(MEMES) || MEMES.length === 0) {
      await interaction.reply({ content: '❌ Nessun meme disponibile al momento.', ephemeral: true });
      return;
    }
    const img = MEMES[Math.floor(Math.random() * MEMES.length)];
    const cap = (Array.isArray(CAPTIONS) && CAPTIONS.length > 0)
      ? CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)]
      : 'Meme del giorno';
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(truncate(`😂 ${cap}`, 256))
      .setThumbnail(interaction.user.displayAvatarURL())
      .setImage(img);
    applyFooter(embed, interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
