const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuild, updateGuild } = require('../../database/guildConfig');

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
      return interaction.reply(
        `⚙️ **Configurazione**\n👋 Benvenuto: ${ch(c.welcomeChannelId)}\n💬 Messaggio: \`${c.welcomeMessage}\`\n👋 Addio: ${ch(c.goodbyeChannelId)}\n📝 Log: ${ch(c.logChannelId)}\n💡 Suggerimenti: ${ch(c.suggestChannelId)}\n🛡️ Automod: **${c.automod.enabled ? 'ON' : 'OFF'}** (spam:${c.automod.antiSpam ? 'on' : 'off'} link:${c.automod.antiLink ? 'on' : 'off'} invite:${c.automod.antiInvite ? 'on' : 'off'})`
      );
    }
    if (sub === 'welcome') {
      const canale = interaction.options.getChannel('canale');
      const msg = interaction.options.getString('messaggio');
      const patch = {};
      if (canale !== null) patch.welcomeChannelId = canale ? canale.id : null;
      if (msg) patch.welcomeMessage = msg.slice(0, 500);
      updateGuild(interaction.guild.id, patch);
      return interaction.reply(`✅ Benvenuto aggiornato: canale ${canale || 'disattivato'}${msg ? `, messaggio: \`${msg}\`` : ''}`);
    }
    if (sub === 'goodbye') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { goodbyeChannelId: canale ? canale.id : null });
      return interaction.reply(`✅ Canale addio: ${canale || 'disattivato'}.`);
    }
    if (sub === 'logs') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { logChannelId: canale ? canale.id : null });
      return interaction.reply(`✅ Canale log: ${canale || 'disattivato'}.`);
    }
    if (sub === 'suggest') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { suggestChannelId: canale ? canale.id : null });
      return interaction.reply(`✅ Canale suggerimenti: ${canale || 'disattivato'}.`);
    }
    if (sub === 'automod') {
      const on = interaction.options.getBoolean('attiva');
      updateGuild(interaction.guild.id, { automod: { enabled: on } });
      return interaction.reply(`🛡️ Automoderazione **${on ? 'attivata' : 'disattivata'}**.`);
    }
  },
};
