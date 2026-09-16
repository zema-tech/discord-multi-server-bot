const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getStarboard, setStarboard, disableStarboard } = require('../../database/starboard');

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
    const sub = interaction.options.getSubcommand();

    if (sub === 'disattiva') {
      disableStarboard(interaction.guild.id);
      return interaction.reply({ content: '✅ Starboard **disattivata**.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mostra') {
      const c = getStarboard(interaction.guild.id);
      const canale = c.channelId ? `<#${c.channelId}>` : '— (disattivata)';
      return interaction.reply({
        content: `⭐ **Starboard**\n📺 Canale: ${canale}\n🔢 Soglia: **${c.threshold}**\n😀 Emoji: ${c.emoji}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // imposta
    const canale = interaction.options.getChannel('canale');
    const soglia = interaction.options.getInteger('soglia') ?? 3;
    const emoji = (interaction.options.getString('emoji') || '⭐').trim().slice(0, 50);

    setStarboard(interaction.guild.id, { channelId: canale.id, threshold: soglia, emoji });
    return interaction.reply({
      content: `✅ Starboard impostata: canale ${canale}, soglia **${soglia}**, emoji ${emoji}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
