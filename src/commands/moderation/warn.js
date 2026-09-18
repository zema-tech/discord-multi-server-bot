const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { addWarn, getWarnings } = require('../../database/warnings');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');
const { logCase } = require('../../database/cases');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c };
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const applyFooter = theme?.applyFooter ?? ((e) => e);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avvisa un utente (3 warn = timeout automatico 10m)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente da avvisare').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser('utente');
    if (!user) {
      return interaction.reply({ embeds: [themeErr('Utente non valido.')], flags: MessageFlags.Ephemeral });
    }
    const reason = truncate(interaction.options.getString('motivo') || 'Nessun motivo specificato', 1024) || 'Nessun motivo specificato';
    if (user.bot) return interaction.reply({ embeds: [themeErr('Non puoi avvisare un bot.')], flags: MessageFlags.Ephemeral });

    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ embeds: [themeErr('Non puoi avvisare il proprietario del server.')], flags: MessageFlags.Ephemeral });
    if (member && !hierarchyAllows(interaction, member))
      return interaction.reply({ embeds: [themeErr('Ruolo uguale/superiore al tuo.')], flags: MessageFlags.Ephemeral });

    const warn = addWarn(interaction.guild.id, user.id, { modId: interaction.user.id, reason });
    try { logCase(interaction.guild.id, { type: 'warn', userId: user.id, modId: interaction.user.id, reason, meta: { warnId: warn.id } }); } catch {}
    const total = getWarnings(interaction.guild.id, user.id).length;

    // Escalation automatica: 3 warn -> timeout 10 minuti
    let extra = '';
    if (total >= 3 && member?.moderatable) {
      try {
        await member.timeout(10 * 60 * 1000, `3 warn raggiunti | Mod: ${interaction.user.tag}`.slice(0, 512));
        extra = '\n⚠️ **3 warn raggiunti: timeout automatico di 10 minuti.**';
      } catch {}
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.warn)
      .setTitle(truncate(`⚠️ Warn #${total} — ${user.tag ?? user.username}`, 256))
      .setDescription(extra ? truncate(extra, 4000) : null)
      .addFields(
        { name: 'Motivo', value: reason },
        { name: 'Moderatore', value: truncate(interaction.user.tag ?? interaction.user.username, 256), inline: true },
        { name: 'ID warn', value: `\`${warn.id}\``, inline: true }
      )
      .setTimestamp();
    if (!extra) embed.setDescription(null);
    applyFooter(embed, interaction);
    try {
      await interaction.reply({ embeds: [embed] });
    } catch {
      return;
    }
    await sendLog(interaction.guild, { embeds: [embed] }).catch(() => {});
    // DM all'utente (best-effort: DM chiusi / bot mai un fallimento del comando)
    try {
      const dm = new EmbedBuilder()
        .setColor(COLORS.warn)
        .setTitle(truncate(`⚠️ Hai ricevuto un warn in ${interaction.guild.name}`, 256))
        .addFields(
          { name: 'Motivo', value: reason },
          { name: 'Moderatore', value: truncate(interaction.user.tag ?? interaction.user.username, 256), inline: true },
          { name: 'Totale warn', value: `${total}`, inline: true }
        )
        .setTimestamp();
      await user.send({ embeds: [dm] }).catch(() => null);
    } catch {}
  },
};
