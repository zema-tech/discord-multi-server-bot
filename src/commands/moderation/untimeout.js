const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Rimuove il timeout da un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo') || 'Timeout rimosso';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ Utente non nel server.', flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(null, `${reason} | Mod: ${interaction.user.tag}`);
      const embed = new EmbedBuilder().setColor(0x57f287).setTitle('✅ Timeout rimosso').setDescription(`${user.tag} può di nuovo parlare.`).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: '❌ Errore.', flags: MessageFlags.Ephemeral });
    }
  },
};
