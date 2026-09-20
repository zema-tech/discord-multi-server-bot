const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../../database/guildConfig');

// theme.js condiviso (fallback inline se il require fallisse).
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    COLORS: { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 },
    ok: (t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    err: (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EmbedBuilder().setColor(c ?? 0x5865f2).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); const n = Math.floor(Number(m)); if (!Number.isFinite(n) || n < 0) return str; return str.length <= n ? str : str.slice(0, n); },
  };
}
const { COLORS, ok, applyFooter, truncate } = theme;

// La configurazione si fa solo dalla dashboard web: i subcommand di scrittura
// rispondono con un puntatore alla sezione corretta (nessuna scrittura DB).
function dashboardLink(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const url = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${url} — sezione ${sezione}`;
}

const SEZIONI_SETUP = {
  welcome: 'Benvenuto e Addii',
  goodbye: 'Benvenuto e Addii',
  logs: 'Generale',
  suggest: 'Generale',
  automod: 'Moderazione',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura il bot per questo server')
    .addSubcommand((s) =>
      s.setName('welcome').setDescription('Canale + messaggio di benvenuto')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale benvenuto (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption((o) => o.setName('messaggio').setDescription('Usa {user} {server} {count}').setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('goodbye').setDescription('Canale di addio')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('logs').setDescription('Canale log moderazione')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('suggest').setDescription('Canale suggerimenti')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('automod').setDescription('Attiva/disattiva automoderazione')
        .addBooleanOption((o) => o.setName('attiva').setDescription('true/false').setRequired(true))
    )
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra la configurazione attuale'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'mostra') {
      const c = getGuild(interaction.guild.id);
      const ch = (id) => (id ? `<#${id}>` : '—');
      // Mai esporre la config in pubblico: reply sempre ephemeral (anti-leak).
      const welcomeMsg = truncate(String(c.welcomeMessage ?? '—'), 200).replace(/`/g, "'");
      const automod = c.automod && typeof c.automod === 'object' ? c.automod : {};
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`⚙️ Configurazione — ${interaction.guild.name}`.slice(0, 256))
        .setDescription('✨ *Stato attuale dei moduli del bot*')
        .addFields(
          { name: '👋 Benvenuto', value: `${ch(c.welcomeChannelId)}\n💬 \`${welcomeMsg}\``, inline: true },
          { name: '👋 Addio / 📝 Log', value: `Addio: ${ch(c.goodbyeChannelId)}\nLog: ${ch(c.logChannelId)}`, inline: true },
          { name: '💡 Suggerimenti / 🛡️ Automod', value: `Sugg.: ${ch(c.suggestChannelId)}\nAutomod: **${automod.enabled ? '🟢 ON' : '🔴 OFF'}** (spam:${automod.antiSpam ? 'on' : 'off'} link:${automod.antiLink ? 'on' : 'off'} invite:${automod.antiInvite ? 'on' : 'off'})`, inline: true }
        )
        .setFooter({ text: 'Usa /wizard per il setup guidato passo passo'.slice(0, 200) })
        .setTimestamp();
      applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    // Scritture di configurazione (welcome/goodbye/logs/suggest/automod):
    // si fanno solo dalla dashboard web, mai dal comando.
    return interaction.reply({ content: dashboardLink(interaction.guild.id, SEZIONI_SETUP[sub] || 'Moduli'), flags: MessageFlags.Ephemeral });
  },
};
