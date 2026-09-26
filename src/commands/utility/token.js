const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { createToken, listTokens, revokeToken } = require('../../database/apiTokens');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('token')
    .setDescription('Token API personali per collegare Claude al bot (solo owner)')
    .addSubcommand((s) =>
      s.setName('crea').setDescription('Crea un token (mostrato una sola volta)')
        .addStringOption((o) => o.setName('nome').setDescription('Etichetta (es. claude-casa)').setRequired(false).setMaxLength(60))
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Token attivi di questo server'))
    .addSubcommand((s) =>
      s.setName('revoca').setDescription('Revoca un token')
        .addStringOption((o) => o.setName('id').setDescription('ID token (da /token lista)').setRequired(true).setMaxLength(64))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ embeds: [themeErr('Solo il proprietario del server può gestire i token.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'crea') {
      const label = (interaction.options.getString('nome') || '').trim();
      let rec;
      try {
        rec = createToken(gid, interaction.user.id, label);
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Creazione fallita.')], flags: MessageFlags.Ephemeral });
      }
      const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '') || 'https://TUO-HOST';
      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🔑 Token creato (una sola vista!)')
        .setDescription(truncate(
          `Endpoint MCP: \`${base}/mcp\`\nHeader: \`Authorization: Bearer <token>\`\nVale SOLO in questo server.\n\n` +
          '```\n' + rec.token + '\n```\n' +
          'Copialo ora: non sarà più recuperabile. Conservalo come password.',
          4000
        ))
        .setFooter({ text: `ID: ${rec.id}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'lista') {
      const list = listTokens(gid);
      if (!list.length) {
        return interaction.reply({ content: '🔑 Nessun token. Creane uno con `/token crea`.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🔑 Token attivi (${list.length})`)
        .setDescription(truncate(list.map((t) =>
          `\`${t.short}\` — ${t.label || 'senza nome'} · usi: **${t.uses}**` +
          (t.lastUsedAt ? ` · ultimo: <t:${Math.floor(t.lastUsedAt / 1000)}:R>` : ' · mai usato') +
          `\nID: \`${t.id}\``
        ).join('\n\n'), 4000))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    const ok = revokeToken(interaction.options.getString('id', true).trim());
    return interaction.reply({ content: ok ? '✅ Token revocato subito.' : '❌ Token non trovato.', flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
