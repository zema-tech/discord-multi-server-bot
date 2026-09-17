const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profilo')
    .setDescription("Mostra il profilo completo di un utente")
    .addUserOption((o) => o.setName('utente').setDescription('Utente (default: tu)').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const guildId = interaction.guild.id;
    const member = interaction.guild.members.cache.get(user.id);

    // Livello (levels)
    let livelloTxt = 'n/d';
    try {
      const { getLevel } = require('../../database/levels');
      const lv = getLevel(guildId, user.id);
      livelloTxt = `Livello **${lv.level}** (${lv.xp} XP)`;
    } catch {}

    // Saldo (economy)
    let saldoTxt = 'n/d';
    try {
      const { getUser } = require('../../database/economy');
      const eco = getUser(guildId, user.id);
      saldoTxt = `**${(eco.balance ?? 0).toLocaleString('it-IT')}** 🪙 (banca: **${(eco.bank ?? 0).toLocaleString('it-IT')}** 🪙)`;
    } catch {}

    // Rep
    let repTxt = 'n/d';
    try {
      const { getRep } = require('../../database/rep');
      repTxt = `**${getRep(guildId, user.id).count}** ⭐`;
    } catch {}

    // Warn count (warnings getWarnings)
    let warnTxt = 'n/d';
    try {
      const { getWarnings } = require('../../database/warnings');
      warnTxt = `**${getWarnings(guildId, user.id).length}** ⚠️`;
    } catch {}

    // Data ingresso
    let ingressoTxt = 'n/d';
    try {
      if (member?.joinedTimestamp) ingressoTxt = `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`;
    } catch {}

    // Ruoli top3 (escluso @everyone)
    let ruoliTxt = 'n/d';
    try {
      if (member) {
        const roles = member.roles.cache
          .filter((r) => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .first(3)
          .map((r) => `${r}`);
        ruoliTxt = roles.length ? roles.join(' ') : 'Nessuno';
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor || 0x5865f2)
      .setTitle(`✨ Profilo di ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '📊 Livello', value: livelloTxt, inline: true },
        { name: '💰 Saldo', value: saldoTxt, inline: true },
        { name: '⭐ Reputazione', value: repTxt, inline: true },
        { name: '⚠️ Warn', value: warnTxt, inline: true },
        { name: '📅 Entrato nel server', value: ingressoTxt, inline: true },
        { name: '🎭 Ruoli principali', value: ruoliTxt.slice(0, 1024) }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
