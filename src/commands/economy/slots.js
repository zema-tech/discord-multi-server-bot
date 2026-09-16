const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');

const SYMBOLS = ['🍒', '🍋', '⭐', '💎', '7️⃣'];
const COOLDOWN = 30 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Slot machine: scommetti le tue monete')
    .addIntegerOption((o) => o.setName('puntata').setDescription('Quanto scommetti').setRequired(true).setMinValue(10).setMaxValue(10000)),
  cooldown: 8,
  async execute(interaction) {
    const bet = interaction.options.getInteger('puntata');
    const data = getUser(interaction.guild.id, interaction.user.id);
    if (data.balance < bet)
      return interaction.reply({ content: `❌ Saldo insufficiente (hai **${data.balance}** 🪙).`, flags: MessageFlags.Ephemeral });
    if (Date.now() - (data.lastSlots || 0) < COOLDOWN)
      return interaction.reply({ content: '⏳ Aspetta qualche secondo tra uno spin e l\'altro.', flags: MessageFlags.Ephemeral });

    const roll = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const [a, b, c] = [roll(), roll(), roll()];
    let mult = 0;
    if (a === b && b === c) mult = a === '7️⃣' ? 10 : a === '💎' ? 6 : 4;
    else if (a === b || b === c || a === c) mult = 1.5;

    const win = Math.floor(bet * mult);
    const delta = win - bet;
    addBalance(interaction.guild.id, interaction.user.id, delta);
    require('../../database/economy').updateUser(interaction.guild.id, interaction.user.id, { lastSlots: Date.now() });

    const embed = new EmbedBuilder()
      .setColor(mult > 0 ? 0x57f287 : 0xed4245)
      .setTitle('🎰 Slot Machine')
      .setDescription(`\`${a} | ${b} | ${c}\`\n\n${mult > 0 ? `🎉 Hai vinto **${win}** 🪙 (x${mult})!` : `😢 Hai perso **${bet}** 🪙. Riprova!`}`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
