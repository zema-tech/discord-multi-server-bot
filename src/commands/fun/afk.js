const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { setAfk, clearAfk, getAfk } = require('../../database/afk');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Avvisa che sei via (o torna)')
    .addStringOption((o) => o.setName('motivo').setDescription('Perché sei via (vuoto = torna)').setRequired(false).setMaxLength(200)),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const motivo = (interaction.options.getString('motivo') || '').trim();
    if (!motivo) {
      const was = getAfk(interaction.guild.id, interaction.user.id);
      clearAfk(interaction.guild.id, interaction.user.id);
      return interaction.reply({ content: was ? '👋 Bentornato! Non sei più AFK.' : 'ℹ️ Non eri AFK.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    setAfk(interaction.guild.id, interaction.user.id, motivo);
    return interaction.reply({ content: `💤 Sei AFK: "${motivo.slice(0, 150)}". Scrivi qualsiasi cosa per tornare (o \`/afk\` senza motivo).`, flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
