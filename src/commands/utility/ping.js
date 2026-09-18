const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { t, getLang } = require('../../utils/i18n');

// Theme condiviso con fallback inline se il require fallisse (mai nomi/opzioni diversi).
let COLORS = { success: 0x57f287, warn: 0xfee75c, error: 0xed4245, primary: 0x5865f2 };
let bar = (cur, max, len = 10) => {
  let length = Math.floor(Number(len));
  if (!Number.isFinite(length) || length < 1) length = 10;
  if (length > 25) length = 25;
  const c = Number(cur);
  const m = Number(max);
  let ratio = 0;
  if (Number.isFinite(c) && Number.isFinite(m) && m > 0) {
    ratio = c / m;
    if (!Number.isFinite(ratio)) ratio = 0;
    if (ratio < 0) ratio = 0;
    if (ratio > 1) ratio = 1;
  }
  const filled = Math.round(ratio * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
};
let applyFooter = (embed, interaction) => {
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente'}`.slice(0, 200) });
  } catch {}
  try { embed.setTimestamp(); } catch {}
  return embed;
};
try {
  const theme = require('../../utils/theme');
  if (theme?.COLORS) COLORS = theme.COLORS;
  if (typeof theme?.bar === 'function') bar = theme.bar;
  if (typeof theme?.applyFooter === 'function') applyFooter = theme.applyFooter;
} catch {}

// NOTA i18n: nome/descrizione slash invariati (restano in IT per ora).
module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Mostra la latenza del bot'),
  cooldown: 3,
  async execute(interaction) {
    const lang = getLang(interaction.guildId);
    const sent = await interaction.reply({ content: t('ping.measuring', lang), withResponse: true });
    const message = sent.resource?.message ?? await interaction.fetchReply().catch(() => null);
    // BUGFIX: rtt/ws sempre finiti >= 0 (fetchReply null o ws.ping NaN mostravano "NaNms").
    const rtt = message && Number.isFinite(message.createdTimestamp - interaction.createdTimestamp)
      ? Math.max(0, Math.round(message.createdTimestamp - interaction.createdTimestamp))
      : 0;
    const ws = Number.isFinite(interaction.client?.ws?.ping) ? Math.max(0, Math.round(interaction.client.ws.ping)) : 0;
    // Barra qualità via theme.bar: latenza 0 -> piena, >=500ms -> vuota.
    const latBar = (v) => {
      const quality = Math.max(0, Math.min(10, 10 - (Number.isFinite(v) ? v : 500) / 50));
      const dot = quality <= 3 ? '🔴' : quality <= 6 ? '🟡' : '🟢';
      return `${dot} \`[${bar(quality, 10, 10)}]\``;
    };
    const up = Math.floor((interaction.client.uptime ?? 0) / 1000);
    const d = Math.floor(up / 86400);
    const h = Math.floor((up % 86400) / 3600);
    const m = Math.floor((up % 3600) / 60);
    const uptime = d > 0 ? `${d}g ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    const embed = new EmbedBuilder()
      .setColor(ws < 150 && rtt < 300 ? COLORS.success : ws < 300 ? COLORS.warn : COLORS.error)
      .setTitle(t('ping.title', lang))
      .setDescription(
        t('ping.body', lang, { rtt, rttBar: latBar(rtt), ws, wsBar: latBar(ws), uptime })
      );
    // Footer i18n preservato; timestamp via helper condiviso.
    try {
      embed.setFooter({ text: t('common.requestedBy', lang, { tag: interaction.user.tag }).slice(0, 200) });
    } catch {
      applyFooter(embed, interaction);
    }
    embed.setTimestamp();
    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
