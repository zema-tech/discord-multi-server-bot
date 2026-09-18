const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// theme.js condiviso (fallback inline se il require fallisse).
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    COLORS: { primary: 0x5865f2 },
    applyFooter: (e) => { try { e.setTimestamp(); } catch {} return e; },
    bar: (cur, max, len = 10) => { const c = Number(cur); const m = Number(max); let r = 0; if (Number.isFinite(c) && Number.isFinite(m) && m > 0) r = Math.min(1, Math.max(0, c / m)); const f = Math.round(r * len); return '█'.repeat(f) + '░'.repeat(len - f); },
    num: (n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('it-IT') : 'n/d'; },
  };
}
const { COLORS, applyFooter, bar, num } = theme;

function boostBar(count) {
  return bar(count, 14, 10);
}

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informazioni sul server'),
  cooldown: 5,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const g = interaction.guild;
    if (!g) return interaction.reply({ content: t('common.guildOnly', lang), flags: MessageFlags.Ephemeral });
    const channels = g.channels.cache;
    const text = channels.filter((c) => c.isTextBased && c.isTextBased() && !c.isThread?.()).size;
    const voice = channels.filter((c) => c.type === 2).size;
    const cats = channels.filter((c) => c.type === 4).size;
    const threads = channels.filter((c) => c.isThread?.()).size;
    const emojiCount = g.emojis.cache.size;
    const stickerCount = g.stickers.cache.size;
    const boosts = g.premiumSubscriptionCount || 0;
    const ts = Math.floor((g.createdTimestamp || Date.now()) / 1000);
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`🏰 ${g.name}`.slice(0, 256))
      .setDescription(t('serverinfo.description', lang, { tier: g.premiumTier, bar: boostBar(boosts), boosts: num(boosts), ownerId: g.ownerId, id: g.id }));
    // Server senza icona/banner: iconURL()/bannerURL() ritornano null -> mai setThumbnail/setImage(null).
    try {
      const icon = typeof g.iconURL === 'function' ? g.iconURL({ size: 256 }) : null;
      if (icon) embed.setThumbnail(icon);
    } catch {
      // thumbnail non critica
    }
    try {
      const banner = typeof g.bannerURL === 'function' ? g.bannerURL({ size: 1024 }) : null;
      if (banner) embed.setImage(banner);
    } catch {
      // image non critica
    }
    embed.addFields(
        { name: t('serverinfo.fields.members', lang), value: t('serverinfo.values.members', lang, { count: num(g.memberCount) }), inline: true },
        {
          name: t('serverinfo.fields.channels', lang),
          value: threads
            ? t('serverinfo.values.channelsThreads', lang, { text, voice, cats, threads })
            : t('serverinfo.values.channels', lang, { text, voice, cats }),
          inline: true,
        },
        { name: t('serverinfo.fields.roles', lang), value: t('serverinfo.values.roles', lang, { count: num(g.roles.cache.size) }), inline: true },
        { name: t('serverinfo.fields.emoji', lang), value: t('serverinfo.values.emoji', lang, { emoji: num(emojiCount), stickers: num(stickerCount) }), inline: true },
        { name: t('serverinfo.fields.boost', lang), value: t('serverinfo.values.boost', lang, { tier: g.premiumTier, boosts: num(boosts) }), inline: true },
        { name: t('serverinfo.fields.created', lang), value: t('serverinfo.values.created', lang, { ts }), inline: true }
      )
      .setFooter({ text: t('serverinfo.footer', lang, { name: g.name, id: g.id }).slice(0, 200) });
    applyFooter(embed, interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
