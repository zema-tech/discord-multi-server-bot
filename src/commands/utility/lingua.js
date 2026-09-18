const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { t, getLang, setLang } = require('../../utils/i18n');
let T;
try {
  T = require('../../utils/theme');
} catch {
  T = {
    COLORS: { primary: 0x5865f2, success: 0x57f287 },
    truncate: (s, m) => String(s ?? '').slice(0, m),
    applyFooter: (e) => e,
  };
}

// NOTA i18n: nomi/descrizioni slash restano in IT (non localizzati via Discord).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('lingua')
    .setDescription('Imposta la lingua del bot per questo server')
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra la lingua attuale del server'))
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Imposta la lingua del server')
        .addStringOption((o) =>
          o.setName('lingua').setDescription('Lingua').setRequired(true)
            .addChoices({ name: 'Italiano 🇮🇹', value: 'it' }, { name: 'English 🇬🇧', value: 'en' })
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    // Fuori da un server il permesso non è valutabile: messaggio dedicato (non "noPerms").
    if (!interaction.guildId || !interaction.guild) {
      return interaction.reply({ content: t('common.guildOnly', getLang(null)), flags: MessageFlags.Ephemeral });
    }
    const lang = getLang(interaction.guildId);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t('common.noPerms', lang), flags: MessageFlags.Ephemeral });
    }
    const labelOf = (l) => t(l === 'en' ? 'lingua.labelEn' : 'lingua.labelIt', lang);
    const sub = interaction.options.getSubcommand();

    if (sub === 'mostra') {
      const cur = getLang(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(T.COLORS.primary ?? 0x5865f2)
        .setTitle(T.truncate(t('lingua.title', cur), 256))
        .setDescription(T.truncate(`${t('lingua.current', cur, { label: labelOf(cur), lang: cur })}\n\n💡 ${t('lingua.hint', cur)}`, 4000))
        .setTimestamp();
      try { T.applyFooter(embed, interaction); } catch { /* footer non critico */ }
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // imposta
    const value = interaction.options.getString('lingua');
    if (value !== 'it' && value !== 'en') {
      return interaction.reply({ content: T.truncate(t('lingua.invalid', lang, { value }), 4000), flags: MessageFlags.Ephemeral });
    }
    setLang(interaction.guildId, value);
    const embed = new EmbedBuilder()
      .setColor(T.COLORS.success ?? 0x57f287)
      .setTitle(T.truncate(t('lingua.title', value), 256))
      .setDescription(T.truncate(t('lingua.set', value, { label: labelOf(value), lang: value }), 4000))
      .setTimestamp();
    try { T.applyFooter(embed, interaction); } catch { /* footer non critico */ }
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
