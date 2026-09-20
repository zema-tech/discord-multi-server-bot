const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { listRewards } = require('../../database/levelRewards');

// theme.js con fallback inline: mai crash se il require fallisce.
let _T = null;
try { _T = require('../../utils/theme'); } catch { _T = null; }
const COLORS = _T?.COLORS ?? { purple: 0x9b59b6 };
const applyFooter = _T?.applyFooter ?? ((embed, interaction) => {
  try { embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { embed.setTimestamp(); } catch { /* ignora */ }
  return embed;
});
const truncate = _T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

function dashboardMsg(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const dest = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${dest} — sezione ${sezione}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premi')
    .setDescription('Gestisci i ruoli premio per i livelli')
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Assegna un ruolo a un livello')
        .addIntegerOption((o) => o.setName('livello').setDescription('Livello (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da assegnare').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi il premio di un livello')
        .addIntegerOption((o) => o.setName('livello').setDescription('Livello (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    )
    .addSubcommand((s) =>
      s.setName('lista').setDescription('Mostra tutti i premi livello')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'lista') {
      const list = listRewards(guildId);
      if (!list.length) {
        return interaction.reply({ content: '📭 Nessun premio livello configurato. Usa la dashboard (sezione Ricompense livello).', flags: MessageFlags.Ephemeral });
      }
      // Micro-fix: con tanti premi la description supererebbe il limite 4096 char.
      const ordinati = [...list].sort((a, b) => a.level - b.level);
      const MAX = 25;
      const righe = ordinati.slice(0, MAX).map((r) => `⭐ Livello **${r.level}** → <@&${r.roleId}>`);
      if (ordinati.length > MAX) righe.push(`…e altri **${ordinati.length - MAX}** premi.`);
      const embed = applyFooter(new EmbedBuilder()
        .setColor(COLORS.purple)
        .setTitle('🏆 Premi livello')
        .setThumbnail(interaction.guild.iconURL() || interaction.user.displayAvatarURL())
        .setDescription(truncate(righe.join('\n'), 4096)), interaction);
      return interaction.reply({ embeds: [embed] });
    }

    // imposta e rimuovi: solo dalla dashboard (nessuna scrittura qui).
    if (sub === 'imposta' || sub === 'rimuovi') {
      return interaction.reply({ content: dashboardMsg(guildId, 'Ricompense livello'), flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: '❌ Sottocomando sconosciuto.', flags: MessageFlags.Ephemeral });
  },
};
