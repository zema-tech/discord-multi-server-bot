const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const ms = require('ms');
const { getGuild } = require('../../database/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Imposta un promemoria (es. 10m, 2h, 1d)')
    .addStringOption((o) => o.setName('tempo').setDescription('Tra quanto: 10m, 2h, 1d (max 7g)').setRequired(true))
    .addStringOption((o) => o.setName('testo').setDescription('Cosa devo ricordarti').setRequired(true))
    .addChannelOption((o) => o.setName('canale').setDescription('Canale dove pubblicare (default: DM)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const raw = interaction.options.getString('tempo');
    // Reply e send hanno limite 2000 char: l'opzione slash ne ammette fino a 6000.
    const text = String(interaction.options.getString('testo') || '').slice(0, 1500);
    const target = interaction.options.getChannel('canale') ?? null;
    const delay = ms(raw);
    if (!delay || delay < 5000 || delay > 7 * 24 * 3600 * 1000)
      return interaction.reply({ content: '❌ Tempo non valido (min 5s, max 7g). Esempi: `10m`, `2h`, `1d`.', flags: MessageFlags.Ephemeral });

    // Se richiesto un canale: valida che esista, sia testuale e che il bot possa scriverci.
    if (target) {
      const ch = await interaction.guild.channels.fetch(target.id).catch(() => null);
      if (!ch || !ch.isTextBased())
        return interaction.reply({ content: '❌ Il canale scelto non è un canale testuale valido.', flags: MessageFlags.Ephemeral });
      const me = interaction.guild.members.me;
      const perms = ch.permissionsFor(me);
      if (!perms || !perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages))
        return interaction.reply({ content: `❌ Non ho i permessi per scrivere in ${ch}.`, flags: MessageFlags.Ephemeral });

      await interaction.reply({ content: `⏰ Ok! Pubblicherò il promemoria in ${ch} <t:${Math.floor((Date.now() + delay) / 1000)}:R>.`, flags: MessageFlags.Ephemeral });
      const timer = setTimeout(() => {
        const embed = new EmbedBuilder().setColor(0xfee75c).setTitle('⏰ Promemoria').setDescription(`**${text}**`.slice(0, 4000)).setFooter({ text: `Per ${interaction.user.tag}`.slice(0, 200) }).setTimestamp();
        ch.send({ content: `⏰ ${interaction.user}`, embeds: [embed] }).catch(() => {
          interaction.followUp({ content: `⏰ ${interaction.user}, promemoria: **${text}** (non sono riuscito a scrivere in ${ch})`, flags: MessageFlags.Ephemeral }).catch(() => {});
        });
      }, delay);
      timer.unref?.();
      return;
    }

    const dmEmbed = new EmbedBuilder().setColor(0xfee75c).setTitle('⏰ Promemoria impostato!').setDescription(`📝 **${text}**\n\n🔔 Ti avviserò <t:${Math.floor((Date.now() + delay) / 1000)}:R> in DM.`).setTimestamp();
    await interaction.reply({ embeds: [dmEmbed] });
    const timer = setTimeout(() => {
      interaction.user.send(`⏰ **Promemoria** (${interaction.guild.name}): ${text}`).catch(() => {
        interaction.followUp({ content: `⏰ ${interaction.user}, promemoria: **${text}**`, flags: MessageFlags.Ephemeral }).catch(() => {});
      });
    }, delay);
    timer.unref?.();
  },
};
