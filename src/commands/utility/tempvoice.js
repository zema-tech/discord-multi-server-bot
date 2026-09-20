const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getConfig } = require('../../database/tempvoice');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  const { EmbedBuilder: EB } = require('discord.js');
  theme = {
    ok: (t, d) => new EB().setColor(0x57f287).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    err: (t) => new EB().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t).slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EB().setColor(c).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; },
  };
}

// Configurazione solo dalla dashboard web: nessun accesso in scrittura al DB da qui.
function dashboardMessaggio(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '') || 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${base}/app.html#gid=${guildId} — sezione ${sezione}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempvoice')
    .setDescription('Configura le vocali temporanee del server')
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Imposta lobby e categoria delle vocali temporanee')
        .addChannelOption((o) => o.setName('lobby').setDescription('Canale vocale lobby').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .addChannelOption((o) => o.setName('categoria').setDescription('Categoria dove creare le vocali').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    )
    .addSubcommand((s) => s.setName('disattiva').setDescription('Disattiva le vocali temporanee'))
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
      return interaction.reply({ content: dashboardMessaggio(interaction.guild.id, 'Vocali temporanee'), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mostra') {
      const c = getConfig(interaction.guild.id);
      const lobby = c.lobbyChannelId ? `<#${c.lobbyChannelId}>` : '— (disattivata)';
      const cat = c.categoryId ? `<#${c.categoryId}>` : '—';
      const embed = theme.info('🎧 Vocali temporanee', `🚪 Lobby: ${lobby}\n📁 Categoria: ${cat}`);
      theme.applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // imposta: configurazione solo dalla dashboard (ramo gia gestito sopra).
    return null;
  },
};
