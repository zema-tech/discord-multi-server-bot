const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, updateUser } = require('../../database/economy');

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

const DAILY_AMOUNT = 500;
const COOLDOWN = 24 * 3600 * 1000;

module.exports = {
  data: new SlashCommandBuilder().setName('daily').setDescription('Ritira la ricompensa giornaliera (500 🪙)'),
  cooldown: 5,
  async execute(interaction) {
    const safeReply = async (payload) => {
      try {
        return await interaction.reply(payload);
      } catch {
        try {
          return await interaction.followUp(payload);
        } catch {
          return null;
        }
      }
    };

    if (!interaction.guild?.id) {
      await safeReply({ embeds: [themeErr('Comando disponibile solo nei server.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (!interaction.user?.id) {
      await safeReply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
      return;
    }

    let data;
    try {
      data = getUser(interaction.guild.id, interaction.user.id) || {};
    } catch {
      data = {};
    }
    const now = Date.now();
    const lastDaily = Number(data.lastDaily) || 0;
    if (now - lastDaily < COOLDOWN) {
      await safeReply({
        content: `⏳ Prossimo daily <t:${Math.floor((lastDaily + COOLDOWN) / 1000)}:R> (<t:${Math.floor((lastDaily + COOLDOWN) / 1000)}:T>)`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Streak solo se l'ultimo daily è di ieri: se saltato (>48h), riparte da 1.
    // Clamp anti-corruzione: dailyStreak non sanito (Infinity/negativo) darebbe streak assurde.
    const prevStreak = Number.isFinite(data.dailyStreak) ? Math.min(Math.max(0, Math.floor(data.dailyStreak)), 10000) : 0;
    const streak = now - lastDaily <= 2 * COOLDOWN ? prevStreak + 1 : 1;
    const bonus = Math.min((streak - 1) * 50, 500);
    const reward = DAILY_AMOUNT + bonus;
    const base = Number.isFinite(data.balance) ? data.balance : 0;
    // RED Bank-style: interessi sui depositi — 2% del salvadanaio, max 500.
    const banked = Number.isFinite(data.bank) ? Math.max(0, data.bank) : 0;
    const interest = Math.min(Math.floor(banked * 0.02), 500);
    try {
      updateUser(interaction.guild.id, interaction.user.id, {
        balance: base + reward + interest,
        lastDaily: now,
        dailyStreak: streak,
      });
    } catch {
      await safeReply({ embeds: [themeErr('Errore durante il ritiro del daily, riprova più tardi.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const nextTs = Math.floor((now + COOLDOWN) / 1000);
    const flames = '🔥'.repeat(Math.min(streak, 10));
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(themeTruncate('🎁 Ricompensa giornaliera!', 256))
      .setDescription(
        themeTruncate(
          `Hai ricevuto **${themeNum(reward)}** 🪙!${interest > 0 ? `\n🏦 Interessi banca (2%): **+${themeNum(interest)}** 🪙` : '\n🏦 Deposita con `/bank deposita` per guadagnare interessi!'}\n${flames}\n🔥 Streak: **${themeNum(streak)}** ${streak === 1 ? 'giorno' : 'giorni'} (+${themeNum(bonus)} bonus)\n⏳ Prossimo bonus <t:${nextTs}:R> (<t:${nextTs}:T>)`,
          4000
        )
      );
    try {
      const url = interaction.user?.displayAvatarURL?.();
      if (url) embed.setThumbnail(url);
    } catch {}
    themeFooter(embed, interaction);
    await safeReply({ embeds: [embed] });
  },
};
