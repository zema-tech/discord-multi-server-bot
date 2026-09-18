const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

// Tema premium condiviso, con fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { success: 0x57f287, error: 0xed4245, warn: 0xfee75c, blue: 0x3498db };
const applyFooter = typeof T?.applyFooter === 'function' ? T.applyFooter : (e, i) => {
  try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { e.setTimestamp(); } catch { /* ignora */ }
  return e;
};

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
    // FIX: valore inatteso (desync choices) → errore chiaro invece di embed "undefined".
    if (!CHOICES.includes(user)) {
      const e = (T?.err ? T.err('Scelta non valida. Usa una delle opzioni: sasso, carta, forbici.') : new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription('Scelta non valida.'));
      applyFooter(e, interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    const bot = CHOICES[Math.floor(Math.random() * 3)];
    let result;
    let color = COLORS.blue;
    if (user === bot) {
      result = '🤝 **PAREGGIO!**';
      color = COLORS.warn;
    } else if ((user === 'sasso' && bot === 'forbici') || (user === 'carta' && bot === 'sasso') || (user === 'forbici' && bot === 'carta')) {
      result = '🎉 **HAI VINTO!**';
      color = COLORS.success;
    } else {
      result = '🤖 **IL BOT VINCE!**';
      color = COLORS.error;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('✊ Carta, Forbici, Sasso')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '⚔️ Sfida', value: `${EMOJI[user]} **${user}**  **VS**  ${EMOJI[bot]} **${bot}**`, inline: false },
        { name: '🏆 Risultato', value: result, inline: false }
      );
    applyFooter(embed, interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
