const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { setBirthday, removeBirthday, getBirthday, listBirthdays, setChannel } = require('../../database/birthdays');

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
    .setName('compleanno')
    .setDescription('Compleanni del server 🎂')
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Salva il tuo compleanno (GG/MM)')
        .addStringOption((o) => o.setName('data').setDescription('Es. 25/12').setRequired(true).setMaxLength(10))
    )
    .addSubcommand((s) => s.setName('rimuovi').setDescription('Dimentica il tuo compleanno'))
    .addSubcommand((s) => s.setName('lista').setDescription('Prossimi compleanni'))
    .addSubcommand((s) =>
      s.setName('canale').setDescription('Canale annunci (staff)')
        .addChannelOption((o) => o.setName('canale').setDescription('Dove festeggiare').addChannelTypes(ChannelType.GuildText).setRequired(false))
    ),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'imposta') {
      try {
        const md = setBirthday(gid, interaction.user.id, interaction.options.getString('data', true));
        const [mm, dd] = md.split('-');
        return interaction.reply({ content: `🎂 Compleanno salvato: **${dd}/${mm}**! Ti festeggeremo qui.`, flags: MessageFlags.Ephemeral }).catch(() => null);
      } catch (e) {
        return interaction.reply({ embeds: [themeErr(e?.message || 'Data non valida.')], flags: MessageFlags.Ephemeral });
      }
    }
    if (sub === 'rimuovi') {
      const ok = removeBirthday(gid, interaction.user.id);
      return interaction.reply({ content: ok ? '✅ Compleanno dimenticato.' : 'ℹ️ Nessun compleanno salvato.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (sub === 'canale') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
      }
      const ch = interaction.options.getChannel('canale');
      setChannel(gid, ch ? ch.id : null);
      return interaction.reply({ content: ch ? `✅ Annunci compleanni in ${ch}.` : '✅ Canale annunci rimosso.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    // lista: ordina per imminenza dal mese/giorno.
    const list = listBirthdays(gid);
    if (!list.length) {
      return interaction.reply({ content: '🎂 Nessun compleanno salvato. Usa `/compleanno imposta`.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const now = new Date();
    const cur = (now.getMonth() + 1) * 100 + now.getDate();
    const key = (md) => {
      const [m, d] = md.split('-').map(Number);
      return m * 100 + d;
    };
    list.sort((a, b) => {
      const ka = key(a.md) >= cur ? key(a.md) - cur : key(a.md) + 1200 - cur;
      const kb = key(b.md) >= cur ? key(b.md) - cur : key(b.md) + 1200 - cur;
      return ka - kb;
    });
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`🎂 Compleanni (${list.length})`)
      .setDescription(truncate(list.slice(0, 25).map((b) => {
        const [m, d] = b.md.split('-');
        return `<@${b.userId}> — **${d}/${m}**`;
      }).join('\n'), 4000))
      .setTimestamp();
    return interaction.reply({ embeds: [embed] }).catch(() => null);
  },
};
