const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { addWarn } = require('../../database/warnings');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avvisa un utente (3 warn = timeout automatico 10m)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente da avvisare').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente');
    const reason = interaction.options.getString('motivo');
    if (user.bot) return interaction.reply({ content: '❌ Non puoi avvisare un bot.', flags: MessageFlags.Ephemeral });

    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && !hierarchyAllows(interaction, member))
      return interaction.reply({ content: '❌ Ruolo uguale/superiore al tuo.', flags: MessageFlags.Ephemeral });

    const warn = addWarn(interaction.guild.id, user.id, { modId: interaction.user.id, reason });
    const total = require('../../database/warnings').getWarnings(interaction.guild.id, user.id).length;

    // Escalation automatica: 3 warn -> timeout 10 minuti
    let extra = '';
    if (total >= 3 && member?.moderatable) {
      try {
        await member.timeout(10 * 60 * 1000, `3 warn raggiunti | Mod: ${interaction.user.tag}`);
        extra = '\n⚠️ **3 warn raggiunti: timeout automatico di 10 minuti.**';
      } catch {}
    }

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`⚠️ Warn #${total} — ${user.tag}`)
      .addFields(
        { name: 'Motivo', value: reason },
        { name: 'Moderatore', value: interaction.user.tag, inline: true },
        { name: 'ID warn', value: `\`${warn.id}\``, inline: true }
      )
      .setTimestamp();
    if (extra) embed.setDescription(extra);
    await interaction.reply({ embeds: [embed] });
    await sendLog(interaction.guild, { embeds: [embed] });
  },
};
