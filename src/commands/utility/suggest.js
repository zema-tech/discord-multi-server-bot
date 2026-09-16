const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getGuild } = require('../../database/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Invia un suggerimento per il server')
    .addStringOption((o) => o.setName('testo').setDescription('Il tuo suggerimento').setRequired(true)),
  cooldown: 10,
  async execute(interaction) {
    const text = interaction.options.getString('testo');
    const cfg = getGuild(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`💡 Suggerimento di ${interaction.user.tag}`)
      .setDescription(text)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    if (cfg.suggestChannelId) {
      const ch = await interaction.guild.channels.fetch(cfg.suggestChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        const m = await ch.send({ embeds: [embed] });
        await m.react('✅').catch(() => {});
        await m.react('❌').catch(() => {});
        return interaction.reply({ content: `✅ Suggerimento inviato in ${ch}!`, flags: MessageFlags.Ephemeral });
      }
    }
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    await message.react('✅').catch(() => {});
    await message.react('❌').catch(() => {});
  },
};
