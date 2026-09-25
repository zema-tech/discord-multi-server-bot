const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getWarnActions, setWarnActions, DEFAULT_ACTIONS } = require('../../database/warnings');

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
const applyFooter = theme?.applyFooter ?? ((e) => e);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

function fmtRule(r) {
  const what = r.action === 'timeout' ? `timeout ${r.minutes} min` : r.action === 'kick' ? 'espulsione' : 'ban';
  return `**${r.warns} warn** → ${what}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnazioni')
    .setDescription('Configura le azioni automatiche a soglia warn (staff)')
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra le regole attive'))
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Sostituisce le regole (max 5, formato compatto)')
        .addStringOption((o) => o.setName('regole').setDescription('Es: "3:timeout:10, 5:kick, 7:ban"').setRequired(true).setMaxLength(200))
    )
    .addSubcommand((s) => s.setName('reset').setDescription('Torna al default (3 warn → timeout 10 min)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'mostra') {
      const rules = getWarnActions(gid);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('⚠️ Azioni automatiche warn')
        .setDescription(truncate(rules.map(fmtRule).join('\n'), 4000))
        .setFooter({ text: 'Formato imposta: "soglia:azione:minuti" — azione: timeout/kick/ban' })
        .setTimestamp();
      applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'reset') {
      setWarnActions(gid, DEFAULT_ACTIONS.map((r) => ({ ...r })));
      return interaction.reply({ content: '✅ Regole ripristinate: **3 warn → timeout 10 min**.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    // imposta: "3:timeout:10, 5:kick, 7:ban"
    const raw = interaction.options.getString('regole', true);
    const rules = [];
    for (const part of raw.split(',')) {
      const [w, a, m] = part.trim().split(':').map((s) => (s || '').trim());
      if (!w || !a) {
        return interaction.reply({ embeds: [themeErr(`Regola non valida: "${part.trim().slice(0, 60)}". Formato: soglia:azione:minuti.`)], flags: MessageFlags.Ephemeral });
      }
      rules.push({ warns: Number(w), action: a.toLowerCase(), minutes: m ? Number(m) : 0 });
    }
    try {
      const saved = setWarnActions(gid, rules);
      return interaction.reply({ content: `✅ Regole salvate:\n${saved.map(fmtRule).join('\n')}`, flags: MessageFlags.Ephemeral }).catch(() => null);
    } catch (e) {
      return interaction.reply({ embeds: [themeErr(e?.message || 'Regole non valide.')], flags: MessageFlags.Ephemeral });
    }
  },
};
