const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informazioni su un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const user = interaction.options.getUser('utente') || interaction.user;
    let member = interaction.guild.members.cache.get(user.id);
    if (!member) member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const badges = [];
    if (user.id === interaction.guild.ownerId) badges.push(t('userinfo.badges.owner', lang));
    if (user.bot) badges.push(t('userinfo.badges.bot', lang));
    if (member?.premiumSinceTimestamp) badges.push(t('userinfo.badges.booster', lang));
    if (member?.permissions.has('Administrator')) badges.push(t('userinfo.badges.admin', lang));
    else if (member?.permissions.has('ManageGuild') || member?.permissions.has('ManageMessages')) badges.push(t('userinfo.badges.staff', lang));
    let joinPos = null;
    if (member?.joinedTimestamp) {
      const sorted = [...interaction.guild.members.cache.values()]
        .filter((m) => m.joinedTimestamp)
        .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
      const idx = sorted.findIndex((m) => m.id === member.id);
      if (idx >= 0) joinPos = `#${idx + 1} su ${sorted.length}`;
    }
    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor || 0x5865f2)
      .setTitle(t('userinfo.title', lang, { tag: user.tag }))
      .setDescription(badges.length ? badges.join(' • ') : t('userinfo.memberFallback', lang))
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: t('userinfo.fields.id', lang), value: `\`${user.id}\``, inline: true },
        { name: t('userinfo.fields.bot', lang), value: user.bot ? t('common.yes', lang) : t('common.no', lang), inline: true },
        { name: t('userinfo.fields.accountCreated', lang), value: t('userinfo.values.dates', lang, { ts: Math.floor(user.createdTimestamp / 1000) }), inline: true }
      );
    if (member) {
      const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id);
      const rolesText = roles.size
        ? roles.sort((a, b) => b.position - a.position).map((r) => `${r}`).join(' ').slice(0, 1024)
        : t('userinfo.noRoles', lang);
      const joinedTs = Math.floor(member.joinedTimestamp / 1000);
      embed.addFields(
        {
          name: t('userinfo.fields.joined', lang),
          value: joinPos
            ? t('userinfo.values.joinedWithPos', lang, { ts: joinedTs, pos: joinPos })
            : t('userinfo.values.joined', lang, { ts: joinedTs }),
          inline: true,
        },
        { name: t('userinfo.fields.topRole', lang), value: `${member.roles.highest}`, inline: true },
        { name: t('userinfo.fields.roles', lang, { count: roles.size }), value: rolesText }
      );
      if (member.premiumSinceTimestamp) {
        embed.addFields({ name: t('userinfo.fields.boostSince', lang), value: t('userinfo.values.boostSince', lang, { ts: Math.floor(member.premiumSinceTimestamp / 1000) }), inline: true });
      }
    }
    embed.setFooter({ text: t('userinfo.footer', lang, { tag: user.tag, id: user.id }).slice(0, 200) }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
