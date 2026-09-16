const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const ms = require('ms');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Mette un utente in timeout (es. 10m, 1h, 1d)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente da silenziare').setRequired(true))
    .addStringOption((o) => o.setName('durata').setDescription('Durata: 30s, 10m, 1h, 1d (max 28d)').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,
  async execute(interaction) {
    const user = interaction.options.getUser('utente');
    const raw = interaction.options.getString('durata');
    const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';
    const duration = ms(raw);

    if (!duration || duration < 5000 || duration > 28 * 24 * 3600 * 1000) {
      return interaction.reply({ content: '❌ Durata non valida. Usa formati come `30s`, `10m`, `2h`, `1d` (min 5s, max 28g).', flags: MessageFlags.Ephemeral });
    }
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ Utente non nel server.', flags: MessageFlags.Ephemeral });
    if (!member.moderatable)
      return interaction.reply({ content: '❌ Non posso moderare questo utente.', flags: MessageFlags.Ephemeral });
    if (!hierarchyAllows(interaction, member))
      return interaction.reply({ content: '❌ Ruolo uguale/superiore al tuo.', flags: MessageFlags.Ephemeral });

    try {
      await member.timeout(duration, `${reason} | Mod: ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('⏱️ Timeout applicato')
        .addFields(
          { name: 'Utente', value: `${user.tag}`, inline: true },
          { name: 'Durata', value: raw, inline: true },
          { name: 'Motivo', value: reason }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Errore timeout.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Errore timeout.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
