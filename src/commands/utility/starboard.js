const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const { getStarboard } = require('../../database/starboard');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  const { EmbedBuilder: EB } = require('discord.js');
  theme = {
    COLORS: { success: 0x57f287, error: 0xed4245, primary: 0x5865f2 },
    ok: (t, d) => new EB().setColor(0x57f287).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    err: (t) => new EB().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t).slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EB().setColor(c).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}
const { COLORS, info, applyFooter, truncate } = theme;

// Configurazione solo dalla dashboard web: nessun accesso in scrittura al DB da qui.
function dashboardMessaggio(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '') || 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${base}/app.html#gid=${guildId} — sezione ${sezione}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configura la bacheca dei messaggi più apprezzati')
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Imposta canale, soglia ed emoji della starboard')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale della starboard').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption((o) => o.setName('soglia').setDescription('Reazioni necessarie (default 3)').setMinValue(1).setMaxValue(100).setRequired(false))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji da contare (default ⭐)').setRequired(false))
    )
    .addSubcommand((s) => s.setName('disattiva').setDescription('Disattiva la starboard'))
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra la configurazione attuale'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [theme.err('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();

    // Configurazione (imposta/disattiva) solo dalla dashboard web.
    if (sub === 'imposta' || sub === 'disattiva') {
      return interaction.reply({ content: dashboardMessaggio(interaction.guild.id, 'Starboard'), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mostra') {
      const c = getStarboard(interaction.guild.id);
      const canale = c.channelId ? `<#${c.channelId}>` : '— (disattivata)';
      const embed = info(
        '⭐ Starboard',
        `📺 Canale: ${canale}\n🔢 Soglia: **${c.threshold}** reazioni\n😀 Emoji: ${truncate(c.emoji, 50)}\n\n💡 *I messaggi che raggiungono la soglia finiscono in bacheca!*`,
        c.channelId ? COLORS.gold ?? 0xfbd000 : 0x99aab5
      );
      applyFooter(embed, interaction);
      try { embed.setFooter({ text: `${interaction.guild.name.slice(0, 100)} • Richiesto da ${interaction.user.tag}`.slice(0, 200) }); } catch {}
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // imposta: configurazione solo dalla dashboard (ramo gia gestito sopra).
    return null;
  },
};
