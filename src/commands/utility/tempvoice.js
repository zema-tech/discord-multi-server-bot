const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getConfig, setConfig, disable } = require('../../database/tempvoice');
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

    if (sub === 'disattiva') {
      disable(interaction.guild.id);
      return interaction.reply({ embeds: [theme.ok('🎧 Vocali temporanee disattivate', 'La creazione automatica di vocali personali è stata **disattivata**.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mostra') {
      const c = getConfig(interaction.guild.id);
      const lobby = c.lobbyChannelId ? `<#${c.lobbyChannelId}>` : '— (disattivata)';
      const cat = c.categoryId ? `<#${c.categoryId}>` : '—';
      const embed = theme.info('🎧 Vocali temporanee', `🚪 Lobby: ${lobby}\n📁 Categoria: ${cat}`);
      theme.applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // imposta
    const lobby = interaction.options.getChannel('lobby');
    const categoria = interaction.options.getChannel('categoria');

    if (!lobby || lobby.type !== ChannelType.GuildVoice) {
      return interaction.reply({ embeds: [theme.err('La lobby deve essere un **canale vocale**.')], flags: MessageFlags.Ephemeral });
    }
    if (!categoria || categoria.type !== ChannelType.GuildCategory) {
      return interaction.reply({ embeds: [theme.err('La categoria deve essere una **categoria**.')], flags: MessageFlags.Ephemeral });
    }

    setConfig(interaction.guild.id, { lobbyChannelId: lobby.id, categoryId: categoria.id });
    const done = theme.ok('🎧 Vocali temporanee attivate!', `🚪 Lobby: ${lobby}\n📁 Categoria: **${String(categoria.name).slice(0, 100)}**\n\nEntra nella lobby per creare la tua vocale personale.`);
    theme.applyFooter(done, interaction);
    return interaction.reply({ embeds: [done], flags: MessageFlags.Ephemeral });
  },
};
