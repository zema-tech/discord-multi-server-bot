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
    const saldo = Number.isFinite(data.balance) ? data.balance : 0;
    if (!Number.isFinite(data.balance) || data.balance < bet)
      return interaction.reply({ content: `❌ Saldo insufficiente (hai **${saldo.toLocaleString('it-IT')}** 🪙).`, flags: MessageFlags.Ephemeral });
    if (Date.now() - (Number(data.lastSlots) || 0) < COOLDOWN)
      return interaction.reply({ content: '⏳ Aspetta qualche secondo tra uno spin e l\'altro.', flags: MessageFlags.Ephemeral });

    const roll = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const [a, b, c] = [roll(), roll(), roll()];
    let mult = 0;
    let combo = 'Nessuna combinazione';
    if (a === b && b === c) {
      mult = a === '7️⃣' ? 10 : a === '💎' ? 6 : 4;
      combo = `Tris di ${a} (x${mult})`;
    } else if (a === b || b === c || a === c) {
      mult = 1.5;
      combo = 'Coppia (x1.5)';
    }

    const win = Math.floor(bet * mult);
    const delta = win - bet;
    addBalance(interaction.guild.id, interaction.user.id, delta);
    require('../../database/economy').updateUser(interaction.guild.id, interaction.user.id, { lastSlots: Date.now() });

    const fmt = (n) => n.toLocaleString('it-IT');
    const esito = mult > 0
      ? `🎉 **VINCITA!** +**${fmt(win)}** 🪙 (x${mult})\n📍 ${combo}`
      : `😢 Hai perso **${fmt(bet)}** 🪙.\n📍 ${combo} — ritenta!`;
    const embed = new EmbedBuilder()
      .setColor(mult > 0 ? 0xffd700 : 0xed4245)
      .setTitle('🎰 Slot Machine')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(
        `┏━━━━━━━━━━━━━┓\n┃  ${a}  ┃  ${b}  ┃  ${c}  ┃\n┗━━━━━━━━━━━━━┛\n\n${esito}\n💰 Puntata: **${fmt(bet)}** 🪙`
      )
      .addFields({
        name: '📖 Tabella payout',
        value: '7️⃣7️⃣7️⃣ → **x10**\n💎💎💎 → **x6**\nTris → **x4**\nCoppia → **x1.5**',
        inline: false,
      })
      .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
