const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const ms = require('ms');
const { getGuild } = require('../../database/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Imposta un promemoria (es. 10m, 2h, 1d)')
    .addStringOption((o) => o.setName('tempo').setDescription('Tra quanto: 10m, 2h, 1d (max 7g)').setRequired(true))
    .addStringOption((o) => o.setName('testo').setDescription('Cosa devo ricordarti').setRequired(true)),
  cooldown: 5,
  async execute(interaction) {
    const raw = interaction.options.getString('tempo');
    const text = interaction.options.getString('testo');
    const delay = ms(raw);
    if (!delay || delay < 5000 || delay > 7 * 24 * 3600 * 1000)
      return interaction.reply({ content: '❌ Tempo non valido (min 5s, max 7g). Esempi: `10m`, `2h`, `1d`.', flags: MessageFlags.Ephemeral });

    await interaction.reply(`⏰ Ok! Ti ricorderò <t:${Math.floor((Date.now() + delay) / 1000)}:R>: **${text}**`);
    setTimeout(() => {
      interaction.user.send(`⏰ **Promemoria** (${interaction.guild.name}): ${text}`).catch(() => {
        interaction.followUp({ content: `⏰ ${interaction.user}, promemoria: **${text}**`, flags: MessageFlags.Ephemeral }).catch(() => {});
      });
    }, delay).unref?.();
  },
};
