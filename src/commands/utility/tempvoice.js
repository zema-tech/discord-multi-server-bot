const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getConfig, setConfig, disable } = require('../../database/tempvoice');

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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'disattiva') {
      disable(interaction.guild.id);
      return interaction.reply({ content: '✅ Vocali temporanee **disattivate**.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mostra') {
      const c = getConfig(interaction.guild.id);
      const lobby = c.lobbyChannelId ? `<#${c.lobbyChannelId}>` : '— (disattivata)';
      const cat = c.categoryId ? `<#${c.categoryId}>` : '—';
      return interaction.reply({
        content: `🎧 **Vocali temporanee**\n🚪 Lobby: ${lobby}\n📁 Categoria: ${cat}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // imposta
    const lobby = interaction.options.getChannel('lobby');
    const categoria = interaction.options.getChannel('categoria');

    if (!lobby || lobby.type !== ChannelType.GuildVoice) {
      return interaction.reply({ content: '❌ La lobby deve essere un **canale vocale**.', flags: MessageFlags.Ephemeral });
    }
    if (!categoria || categoria.type !== ChannelType.GuildCategory) {
      return interaction.reply({ content: '❌ La categoria deve essere una **categoria**.', flags: MessageFlags.Ephemeral });
    }

    setConfig(interaction.guild.id, { lobbyChannelId: lobby.id, categoryId: categoria.id });
    return interaction.reply({
      content: `✅ Vocali temporanee attivate!\n🚪 Lobby: ${lobby}\n📁 Categoria: **${categoria.name}**\n\nEntra nella lobby per creare la tua vocale personale.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
