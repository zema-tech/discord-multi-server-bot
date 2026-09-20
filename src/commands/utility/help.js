const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');
let T;
try {
  T = require('../../utils/theme');
} catch {
  T = {
    COLORS: { primary: 0x5865f2 },
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra la lista di tutti i comandi disponibili'),
  cooldown: 5,
  async execute(interaction, client) {
    const lang = getLang(interaction.guildId);
    const byFolder = {};
    const cmds = client?.commands;
    const total = cmds?.size ?? 0;
    if (cmds) {
      for (const [, cmd] of cmds) {
        const file = cmd?.category || 'altri';
        if (!byFolder[file]) byFolder[file] = [];
        const name = cmd?.data?.name;
        if (name) byFolder[file].push(`\`/${name}\``);
      }
    }
    const titles = {
      moderation: t('help.categories.moderation', lang), fun: t('help.categories.fun', lang),
      economy: t('help.categories.economy', lang), utility: t('help.categories.utility', lang),
      levels: t('help.categories.levels', lang), tickets: t('help.categories.tickets', lang),
      ai: t('help.categories.ai', lang), music: t('help.categories.music', lang),
      altri: t('help.categories.altri', lang),
    };
    const servers = interaction.client?.guilds?.cache?.size ?? 0;
    const embed = new EmbedBuilder()
      .setColor(T.COLORS.primary ?? 0x5865f2)
      .setTitle(T.truncate(t('help.title', lang, { name: interaction.client?.user?.username ?? 'Bot' }), 256))
      .setDescription(T.truncate(t('help.description', lang, { count: total, servers }), 4000));
    try {
      const thumb = interaction.client?.user?.displayAvatarURL?.();
      if (thumb) embed.setThumbnail(thumb);
    } catch { /* thumbnail non critica */ }
    // Discord: max 25 fields — oltre si tronca (bug reale con tanti comandi/categorie).
    for (const [cat, list] of Object.entries(byFolder).slice(0, 25)) {
      const sorted = list.sort();
      const label = T.truncate(`${titles[cat] || t('help.unknownCategory', lang, { cat })} (${sorted.length})`, 256);
      embed.addFields({ name: label, value: T.truncate(sorted.join(' ') || t('help.emptyField', lang), 1024) || t('help.emptyField', lang) });
    }
    const baseUrl = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
    // La configurazione del bot si fa solo dalla dashboard web: il footer non
    // rimanda piu ai comandi di setup via Discord.
    const dashboardUrl = baseUrl ? `${baseUrl}/app.html` : '';
    const footerText = dashboardUrl
      ? `Configura il server dalla dashboard: ${dashboardUrl}`
      : 'Configura il server dalla dashboard web (chiedi allo staff il link)';
    embed.setFooter({ text: T.truncate(footerText, 200) }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
