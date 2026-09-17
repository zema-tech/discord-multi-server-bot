const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { sendLog } = require('../../utils/helpers');
const { logCase } = require('../../database/cases');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Sbanna un utente tramite ID')
    .addStringOption((o) => o.setName('userid').setDescription('ID utente da sbannare').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const id = interaction.options.getString('userid');
    if (!/^\d{17,20}$/.test(id)) {
      return interaction.reply({ content: '❌ ID non valido: deve essere un ID utente numerico.', flags: MessageFlags.Ephemeral });
    }
    const reason = (interaction.options.getString('motivo') || 'Nessun motivo').slice(0, 512);
    try {
      await interaction.guild.bans.remove(id, `${reason} | Mod: ${interaction.user.tag}`.slice(0, 512));
      try { logCase(interaction.guild.id, { type: 'unban', userId: id, modId: interaction.user.id, reason }); } catch {}
      const embed = new EmbedBuilder().setColor(0x57f287).setTitle('✅ Utente sbannato').setDescription(`ID: \`${id}\`\nMotivo: ${reason}`.slice(0, 4096)).setTimestamp();
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch {
      await interaction.reply({ content: '❌ ID non valido o utente non bannato.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
};
