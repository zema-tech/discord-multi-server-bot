const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { WHITELIST, listKeys, setOverride, deleteOverride, effectiveEnv, mask } = require('../../database/settings');

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

function isOwner(interaction) {
  try {
    return interaction.guild && interaction.user.id === interaction.guild.ownerId;
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configura il bot dalla chat (vale subito, senza restart)')
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra i valori effettivi (segreti mascherati)'))
    .addSubcommand((s) => s.setName('lista').setDescription('Chiavi configurabili'))
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Imposta una variabile (segreti solo owner)')
        .addStringOption((o) => o.setName('chiave').setDescription('Es. AI_PROVIDER').setRequired(true).setMaxLength(32))
        .addStringOption((o) => o.setName('valore').setDescription('Nuovo valore').setRequired(true).setMaxLength(300))
    )
    .addSubcommand((s) =>
      s.setName('reset').setDescription('Torna a .env/default per una chiave')
        .addStringOption((o) => o.setName('chiave').setDescription('Chiave da resettare').setRequired(true).setMaxLength(32))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const owner = isOwner(interaction);

    if (sub === 'lista') {
      const lines = listKeys().map((k) => `\`${k.key}\`${k.secret ? ' 🔒' : ''} — ${k.hint}${k.overridden ? ' *(override)*' : ''}`);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🔧 Chiavi configurabili')
        .setDescription(truncate(lines.join('\n'), 4000))
        .setFooter({ text: '🔒 = solo owner · (override) = impostato da /config' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'mostra') {
      let env = {};
      try {
        env = effectiveEnv();
      } catch {}
      const lines = listKeys().map((k) => {
        const raw = env[k.key];
        const shown = raw === undefined || raw === null || raw === '' ? '—' : (k.secret ? mask(raw) : String(raw).slice(0, 60));
        const src = (() => {
          try {
            const { getOverride } = require('../../database/settings');
            return getOverride(k.key) !== undefined ? 'chat' : 'env';
          } catch { return 'env'; }
        })();
        return `\`${k.key}\` = ${shown} _(${src})_`;
      });
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🔧 Configurazione effettiva')
        .setDescription(truncate(lines.join('\n'), 4000))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    const chiave = String(interaction.options.getString('chiave') || '').toUpperCase().trim();
    const meta = WHITELIST[chiave];
    if (!meta) {
      return interaction.reply({ embeds: [themeErr(`Chiave sconosciuta. Vedi /config lista.`)], flags: MessageFlags.Ephemeral });
    }
    if (meta.secret && !owner) {
      return interaction.reply({ embeds: [themeErr('Le chiavi segrete le imposta solo il proprietario del server.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'imposta') {
      const valore = interaction.options.getString('valore', true);
      try {
        const saved = setOverride(chiave, valore);
        const shown = meta.secret ? mask(saved.value) : saved.value;
        return interaction.reply({ content: `✅ \`${chiave}\` = ${shown} (vale subito, senza restart).`, flags: MessageFlags.Ephemeral }).catch(() => null);
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Valore non valido.')], flags: MessageFlags.Ephemeral });
      }
    }

    // reset
    try {
      const existed = deleteOverride(chiave);
      return interaction.reply({
        content: existed ? `✅ \`${chiave}\` resettato (torna .env/default).` : `ℹ️ \`${chiave}\` non aveva override.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    } catch (e) {
      return interaction.reply({ embeds: [themeErr(e?.message || 'Reset fallito.')], flags: MessageFlags.Ephemeral });
    }
  },
};
