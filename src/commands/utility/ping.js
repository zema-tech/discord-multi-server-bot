const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Mostra la latenza del bot'),
  cooldown: 3,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const sent = await interaction.reply({ content: t('ping.measuring', lang), withResponse: true });
    const message = sent.resource?.message ?? await interaction.fetchReply().catch(() => null);
    const rtt = message ? message.createdTimestamp - interaction.createdTimestamp : 0;
    const ws = Math.max(0, Math.round(interaction.client.ws.ping));
    const latBar = (v) => {
      const filled = Math.max(0, Math.min(10, Math.round(Math.max(0, 10 - v / 50))));
      const dot = filled <= 3 ? '🔴' : filled <= 6 ? '🟡' : '🟢';
      return `${dot} \`[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]\``;
    };
    const up = Math.floor((interaction.client.uptime ?? 0) / 1000);
    const d = Math.floor(up / 86400);
    const h = Math.floor((up % 86400) / 3600);
    const m = Math.floor((up % 3600) / 60);
    const uptime = d > 0 ? `${d}g ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    const embed = new EmbedBuilder()
      .setColor(ws < 150 && rtt < 300 ? 0x57f287 : ws < 300 ? 0xfee75c : 0xed4245)
      .setTitle(t('ping.title', lang))
      .setDescription(
        t('ping.body', lang, { rtt, rttBar: latBar(rtt), ws, wsBar: latBar(ws), uptime })
      )
      .setFooter({ text: t('common.requestedBy', lang, { tag: interaction.user.tag }).slice(0, 200) })
      .setTimestamp();
    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
