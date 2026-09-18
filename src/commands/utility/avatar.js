const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// Tema premium condiviso, con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2 };
let applyFooter = (embed, interaction) => {
  try {
    const tag = interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente';
    embed.setFooter({ text: `Richiesto da ${tag}`.slice(0, 200) });
    embed.setTimestamp();
  } catch { /* footer non critico */ }
  return embed;
};
let truncate = (s, max) => String(s ?? '').slice(0, max);
try {
  const theme = require('../../utils/theme');
  COLORS = theme.COLORS ?? COLORS;
  applyFooter = theme.applyFooter ?? applyFooter;
  truncate = theme.truncate ?? truncate;
} catch { /* fallback inline sopra */ }

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Mostra l'avatar di un utente")
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const user = interaction.options.getUser('utente') || interaction.user;
    // dynamic:true conserva l'animazione dei GIF-avatar; tag con fallback
    // per il nuovo sistema username (discriminator "0" → niente "#0").
    const url = user.displayAvatarURL({ size: 1024, dynamic: true });
    const rawTag = user.tag ?? user.username;
    const tag = rawTag.endsWith('#0') ? `@${user.username}` : rawTag;
    const embed = applyFooter(
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(truncate(t('avatar.title', lang, { tag }), 256))
        .setDescription(t('avatar.description', lang, {
          url,
          id: user.id,
          kind: user.bot ? t('avatar.kindBot', lang) : t('avatar.kindUser', lang),
        }))
        .setImage(url),
      interaction
    );
    await interaction.reply({ embeds: [embed] });
  },
};
