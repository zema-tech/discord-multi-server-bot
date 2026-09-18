const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    COLORS: { primary: 0x5865f2 },
    truncate: (s, m) => String(s ?? '').slice(0, m),
    num: (n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('it-IT') : 'n/d'; },
  };
}

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informazioni su un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const lang = getLang(interaction.guildId);
    const user = interaction.options.getUser('utente') || interaction.user;
    let member = interaction.guild.members.cache.get(user.id);
    // FIX member null: fetch può fallire (utente uscito dal server) → member resta null;
    // tutto il blocco sotto deve tollerarlo (prima joinedTimestamp null → NaN → <t:NaN> rotto,
    // e displayHexColor '#000000' → embed nero).
    if (!member) member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const badges = [];
    if (user.id === interaction.guild.ownerId) badges.push(t('userinfo.badges.owner', lang));
    if (user.bot) badges.push(t('userinfo.badges.bot', lang));
    if (member?.premiumSinceTimestamp) badges.push(t('userinfo.badges.booster', lang));
    if (member?.permissions?.has('Administrator')) badges.push(t('userinfo.badges.admin', lang));
    else if (member?.permissions?.has('ManageGuild') || member?.permissions?.has('ManageMessages')) badges.push(t('userinfo.badges.staff', lang));
    let joinPos = null;
    if (member?.joinedTimestamp) {
      const sorted = [...interaction.guild.members.cache.values()]
        .filter((m) => m.joinedTimestamp)
        .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
      const idx = sorted.findIndex((m) => m.id === member.id);
      if (idx >= 0) joinPos = `#${idx + 1} su ${sorted.length}`;
    }
    const colorRaw = member?.displayHexColor;
    // FIX: '#000000' = nessun ruolo colorato → usa il blu premium invece dell'embed nero.
    const color = !colorRaw || colorRaw === '#000000' ? theme.COLORS.primary ?? 0x5865f2 : colorRaw;
    const embed = new EmbedBuilder()
      .setColor(color)
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
        ? theme.truncate(roles.sort((a, b) => b.position - a.position).map((r) => `${r}`).join(' '), 1024)
        : t('userinfo.noRoles', lang);
      // FIX: joinedTimestamp null (member parziale) → prima Math.floor(null/1000)=0 → data 1970;
      // ora mostra solo la posizione o 'n/d' senza timestamp fasullo.
      const joinedTs = Number.isFinite(member.joinedTimestamp) ? Math.floor(member.joinedTimestamp / 1000) : null;
      embed.addFields(
        {
          name: t('userinfo.fields.joined', lang),
          value: joinedTs
            ? joinPos
              ? t('userinfo.values.joinedWithPos', lang, { ts: joinedTs, pos: joinPos })
              : t('userinfo.values.joined', lang, { ts: joinedTs })
            : joinPos || 'n/d',
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
    // FIX: member null (utente non più nel server) → niente crash, nota esplicita invece di campi vuoti.
    if (!member) {
      embed.addFields({ name: t('userinfo.fields.joined', lang), value: '— (non nel server)', inline: true });
    }
    await interaction.reply({ embeds: [embed] });
  },
};
