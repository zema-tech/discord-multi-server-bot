const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CHOICES = ['sasso', 'carta', 'forbici'];
const EMOJI = { sasso: '🪨', carta: '📄', forbici: '✂️' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Carta, forbici, sasso contro il bot')
    .addStringOption((o) =>
      o.setName('scelta').setDescription('La tua scelta').setRequired(true)
        .addChoices(
          { name: '🪨 Sasso', value: 'sasso' },
          { name: '📄 Carta', value: 'carta' },
          { name: '✂️ Forbici', value: 'forbici' }
        )
    ),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getString('scelta');
    const bot = CHOICES[Math.floor(Math.random() * 3)];
    let result;
    let color = 0x3498db;
    if (user === bot) {
      result = '🤝 **PAREGGIO!**';
      color = 0xfee75c;
    } else if ((user === 'sasso' && bot === 'forbici') || (user === 'carta' && bot === 'sasso') || (user === 'forbici' && bot === 'carta')) {
      result = '🎉 **HAI VINTO!**';
      color = 0x57f287;
    } else {
      result = '🤖 **IL BOT VINCE!**';
      color = 0xed4245;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('✊ Carta, Forbici, Sasso')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '⚔️ Sfida', value: `${EMOJI[user]} **${user}**  **VS**  ${EMOJI[bot]} **${bot}**`, inline: false },
        { name: '🏆 Risultato', value: result, inline: false }
      )
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
