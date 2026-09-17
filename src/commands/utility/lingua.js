const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { t, getLang, setLang } = require('../../utils/i18n');

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
    const lang = getLang(interaction.guildId);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: t('common.noPerms', lang), flags: MessageFlags.Ephemeral });
    }
    const labelOf = (l) => t(l === 'en' ? 'lingua.labelEn' : 'lingua.labelIt', lang);
    const sub = interaction.options.getSubcommand();

    if (sub === 'mostra') {
      const cur = getLang(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t('lingua.title', cur))
        .setDescription(`${t('lingua.current', cur, { label: labelOf(cur), lang: cur })}\n\n💡 ${t('lingua.hint', cur)}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // imposta
    const value = interaction.options.getString('lingua');
    if (value !== 'it' && value !== 'en') {
      return interaction.reply({ content: t('lingua.invalid', lang, { value }), flags: MessageFlags.Ephemeral });
    }
    setLang(interaction.guildId, value);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(t('lingua.title', value))
      .setDescription(t('lingua.set', value, { label: labelOf(value), lang: value }))
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
