const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
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
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`⚙️ Configurazione — ${interaction.guild.name}`.slice(0, 256))
        .setDescription('✨ *Stato attuale dei moduli del bot*')
        .addFields(
          { name: '👋 Benvenuto', value: `${ch(c.welcomeChannelId)}\n💬 \`${String(c.welcomeMessage).slice(0, 200)}\``, inline: true },
          { name: '👋 Addio / 📝 Log', value: `Addio: ${ch(c.goodbyeChannelId)}\nLog: ${ch(c.logChannelId)}`, inline: true },
          { name: '💡 Suggerimenti / 🛡️ Automod', value: `Sugg.: ${ch(c.suggestChannelId)}\nAutomod: **${c.automod.enabled ? '🟢 ON' : '🔴 OFF'}** (spam:${c.automod.antiSpam ? 'on' : 'off'} link:${c.automod.antiLink ? 'on' : 'off'} invite:${c.automod.antiInvite ? 'on' : 'off'})`, inline: true }
        )
        .setFooter({ text: 'Usa /wizard per il setup guidato passo passo'.slice(0, 200) })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'welcome') {
      const canale = interaction.options.getChannel('canale');
      const msg = interaction.options.getString('messaggio');
      const patch = {};
      if (canale !== null) patch.welcomeChannelId = canale ? canale.id : null;
      if (msg) patch.welcomeMessage = msg.slice(0, 500);
      updateGuild(interaction.guild.id, patch);
      return interaction.reply({ content: `✅ Benvenuto aggiornato: canale ${canale || 'disattivato'}${msg ? `, messaggio: \`${msg.slice(0, 200)}\`` : ''}`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'goodbye') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { goodbyeChannelId: canale ? canale.id : null });
      return interaction.reply({ content: `✅ Canale addio: ${canale || 'disattivato'}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'logs') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { logChannelId: canale ? canale.id : null });
      return interaction.reply({ content: `✅ Canale log: ${canale || 'disattivato'}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'suggest') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { suggestChannelId: canale ? canale.id : null });
      return interaction.reply({ content: `✅ Canale suggerimenti: ${canale || 'disattivato'}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'automod') {
      const on = interaction.options.getBoolean('attiva');
      updateGuild(interaction.guild.id, { automod: { enabled: on } });
      return interaction.reply({ content: `🛡️ Automoderazione **${on ? 'attivata 🟢' : 'disattivata 🔴'}**.`, flags: MessageFlags.Ephemeral });
    }
  },
};
