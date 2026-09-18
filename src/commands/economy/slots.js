const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance, updateUser } = require('../../database/economy');

// theme.js con fallback inline: mai crash se il require fallisce.
let _T = null;
try { _T = require('../../utils/theme'); } catch { _T = null; }
const COLORS = _T?.COLORS ?? { gold: 0xffd700, error: 0xed4245 };
const applyFooter = _T?.applyFooter ?? ((embed, interaction) => {
  try { embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { embed.setTimestamp(); } catch { /* ignora */ }
  return embed;
});
const num = _T?.num ?? ((n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d'));
const truncate = _T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

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
    // Difesa: option required + min/max lato Discord, ma mock/test possono passare NaN/null.
    if (!Number.isInteger(bet) || bet < 10 || bet > 10000)
      return interaction.reply({ content: '❌ Puntata non valida: usa un intero tra 10 e 10.000 🪙.', flags: MessageFlags.Ephemeral });
    const data = getUser(interaction.guild.id, interaction.user.id);
    const saldo = Number.isFinite(data.balance) ? data.balance : 0;
    if (!Number.isFinite(data.balance) || data.balance < bet)
      return interaction.reply({ content: `❌ Saldo insufficiente (hai **${num(saldo)}** 🪙).`, flags: MessageFlags.Ephemeral });
    const last = Number(data.lastSlots) || 0;
    if (Date.now() - last < COOLDOWN) {
      const ready = Math.floor((last + COOLDOWN) / 1000);
      return interaction.reply({ content: `⏳ Prossimo spin <t:${ready}:R> (<t:${ready}:T>).`, flags: MessageFlags.Ephemeral });
    }

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
    updateUser(interaction.guild.id, interaction.user.id, { lastSlots: Date.now() });

    const esito = mult > 0
      ? `🎉 **VINCITA!** +**${num(win)}** 🪙 (x${mult})\n📍 ${combo}`
      : `😢 Hai perso **${num(bet)}** 🪙.\n📍 ${combo} — ritenta!`;
    const embed = applyFooter(new EmbedBuilder()
      .setColor(mult > 0 ? COLORS.gold : COLORS.error)
      .setTitle('🎰 Slot Machine')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(
        truncate(`┏━━━━━━━━━━━━━┓\n┃  ${a}  ┃  ${b}  ┃  ${c}  ┃\n┗━━━━━━━━━━━━━┛\n\n${esito}\n💰 Puntata: **${num(bet)}** 🪙`, 4000)
      )
      .addFields({
        name: '📖 Tabella payout',
        value: '7️⃣7️⃣7️⃣ → **x10**\n💎💎💎 → **x6**\nTris → **x4**\nCoppia → **x1.5**',
        inline: false,
      }), interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
