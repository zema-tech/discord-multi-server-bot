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
    if (user === bot) result = '🤝 **Pareggio!**';
    else if ((user === 'sasso' && bot === 'forbici') || (user === 'carta' && bot === 'sasso') || (user === 'forbici' && bot === 'carta')) result = '🎉 **Hai vinto!**';
    else result = '🤖 **Il bot vince!**';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('✊ Carta, Forbici, Sasso')
      .addFields(
        { name: 'Tu', value: `${EMOJI[user]} ${user}`, inline: true },
        { name: 'Bot', value: `${EMOJI[bot]} ${bot}`, inline: true },
        { name: 'Risultato', value: result }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
