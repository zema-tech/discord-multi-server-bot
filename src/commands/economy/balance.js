const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser } = require('../../database/economy');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS || { gold: 0xffd700, error: 0xed4245 };
const themeErr =
  typeof theme?.err === 'function'
    ? theme.err
    : (t) =>
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Errore')
          .setDescription(String(t ?? '').slice(0, 4000))
          .setTimestamp();
const themeFooter =
  typeof theme?.applyFooter === 'function'
    ? theme.applyFooter
    : (e, i) => {
        try {
          e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` });
        } catch {}
        try {
          e.setTimestamp();
        } catch {}
        return e;
      };
const themeNum = typeof theme?.num === 'function' ? theme.num : (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
const themeTruncate =
  typeof theme?.truncate === 'function'
    ? theme.truncate
    : (s, max) => String(s ?? '').slice(0, max);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Vedi il tuo saldo o quello di un altro utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild?.id) {
      try {
        await interaction.reply({ embeds: [themeErr('Comando disponibile solo nei server.')], flags: MessageFlags.Ephemeral });
      } catch {
        // ignora
      }
      return;
    }
    const user = interaction.options.getUser('utente') || interaction.user;
    if (!user?.id) {
      try {
        await interaction.reply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
      } catch {}
      return;
    }

    let data;
    try {
      data = getUser(interaction.guild.id, user.id) || {};
    } catch {
      data = {};
    }
    // Guard NaN/Infinity: saldi corrotti mostrerebbero "NaN" o "Infinity".
    const wallet = Number.isFinite(data.balance) ? data.balance : 0;
    const bank = Number.isFinite(data.bank) ? data.bank : 0;
    const total = wallet + bank;
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(themeTruncate(`💰 Saldo di ${user.username ?? user.tag ?? 'Utente'}`, 256));
    try {
      const url = user.displayAvatarURL?.();
      if (url) embed.setThumbnail(url);
    } catch {
      // thumbnail non critica
    }
    try {
      embed.addFields(
        { name: '👛 Portafoglio', value: `**${themeNum(wallet)}** 🪙`, inline: true },
        { name: '🏦 Banca', value: `**${themeNum(bank)}** 🪙`, inline: true },
        { name: '💎 Totale', value: `**${themeNum(total)}** 🪙`, inline: true }
      );
    } catch {
      embed.setDescription(`👛 Portafoglio: **${themeNum(wallet)}** 🪙\n🏦 Banca: **${themeNum(bank)}** 🪙\n💎 Totale: **${themeNum(total)}** 🪙`);
    }
    themeFooter(embed, interaction);
    try {
      await interaction.reply({ embeds: [embed] });
    } catch {
      try {
        await interaction.followUp({ embeds: [embed] });
      } catch {}
    }
  },
};
