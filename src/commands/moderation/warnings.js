const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getWarnings, clearWarnings, removeWarn } = require('../../database/warnings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription("Gestisci gli avvisi di un utente")
    .addSubcommand((s) =>
      s.setName('lista').setDescription("Vedi gli avvisi di un utente").addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi un singolo warn tramite ID').addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true)).addStringOption((o) => o.setName('id').setDescription('ID del warn').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('pulisci').setDescription('Rimuovi tutti i warn di un utente').addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('utente');

    if (sub === 'lista') {
      const warns = getWarnings(interaction.guild.id, user.id);
      if (!warns.length) return interaction.reply({ content: `✅ ${user.tag} non ha warn.`, flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`⚠️ Warn di ${user.tag} (${warns.length})`)
        .setDescription(warns.map((w, i) => `**${i + 1}.** \`${w.id}\` — ${w.reason}\n<@${w.modId}> • <t:${Math.floor(w.at / 1000)}:R>`).join('\n\n').slice(0, 4000))
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    if (sub === 'rimuovi') {
      const id = interaction.options.getString('id');
      const ok = removeWarn(interaction.guild.id, user.id, id);
      return interaction.reply({ content: ok ? `✅ Warn \`${id}\` rimosso.` : `❌ Warn \`${id}\` non trovato.`, flags: MessageFlags.Ephemeral });
    }
    clearWarnings(interaction.guild.id, user.id);
    return interaction.reply({ content: `🧹 Tutti i warn di ${user.tag} sono stati rimossi.`, flags: MessageFlags.Ephemeral });
  },
};
