const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');

// theme.js con fallback inline se il require fallisse.
let COLORS = { gold: 0xffd700 };
let applyFooter = (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; };
let num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
try {
  const t = require('../../utils/theme');
  COLORS = t.COLORS || COLORS;
  applyFooter = t.applyFooter || applyFooter;
  num = t.num || num;
} catch { /* fallback inline sopra */ }

// Reply sicura: mai unhandled rejection.
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Invia monete a un altro utente')
    .addUserOption((o) => o.setName('utente').setDescription('Destinatario').setRequired(true))
    .addIntegerOption((o) => o.setName('importo').setDescription('Quantità').setRequired(true).setMinValue(1)),
  cooldown: 5,
  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) return safeReply(interaction, { content: '❌ Comando disponibile solo nei server.' });
    const target = interaction.options.getUser('utente');
    const amount = interaction.options.getInteger('importo');
    // amount arriva da SlashCommand (min 1), ma ricontrolla: mai NaN/negativi/infiniti.
    if (!target || !Number.isInteger(amount) || amount < 1)
      return safeReply(interaction, { content: '❌ Importo non valido.', flags: MessageFlags.Ephemeral });
    if (target.bot) return safeReply(interaction, { content: '❌ Non puoi pagare un bot.', flags: MessageFlags.Ephemeral });
    if (target.id === interaction.user.id) return safeReply(interaction, { content: '❌ Non puoi pagare te stesso.', flags: MessageFlags.Ephemeral });

    const sender = getUser(guildId, interaction.user.id);
    const senderBalance = Number.isFinite(sender.balance) ? sender.balance : 0;
    // Saldo corrotto (NaN): blocca invece di regalare soldi dal nulla
    if (!Number.isFinite(sender.balance) || sender.balance < amount)
      return safeReply(interaction, { content: `❌ Saldo insufficiente (hai **${num(senderBalance)}** 🪙).`, flags: MessageFlags.Ephemeral });

    addBalance(guildId, interaction.user.id, -amount);
    addBalance(guildId, target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('💸 Pagamento inviato')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(
        `${interaction.user} ➡️ ${target}\n💰 Importo: **${num(amount)}** 🪙\n👛 Il tuo nuovo saldo: **${num(senderBalance - amount)}** 🪙`
      )
      .setTimestamp();
    applyFooter(embed, interaction);
    await safeReply(interaction, { embeds: [embed] });
  },
};
