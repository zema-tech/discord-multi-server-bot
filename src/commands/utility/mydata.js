const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder,
} = require('discord.js');
const { exportData, forgetData } = require('../../utils/mydata');

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
    .setName('mydata')
    .setDescription('I tuoi dati nel bot: esporta o cancella (GDPR, solo questo server)')
    .addSubcommand((s) => s.setName('esporta').setDescription('Scarica tutto ciò che il bot sa di te qui'))
    .addSubcommand((s) => s.setName('dimentica').setDescription('Cancella i tuoi dati da questo server')),
  cooldown: 10,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const uid = interaction.user.id;

    if (sub === 'esporta') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      if (!interaction.deferred && !interaction.replied) return;
      let snap;
      try {
        snap = exportData(gid, uid);
      } catch {
        return interaction.editReply({ embeds: [themeErr('Export fallito, riprova.')] }).catch(() => {});
      }
      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(snap, null, 2), 'utf-8'), { name: `mydata-${gid}-${uid}.json` });
      return interaction.editReply({ content: '📦 Ecco i tuoi dati in **questo server** (altri server: chiedi lì).', files: [file] }).catch(() => {});
    }

    // dimentica: conferma via bottoni (60s), poi cancella.
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mydata_yes').setLabel('Sì, cancella tutto').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mydata_no').setLabel('Annulla').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle('⚠️ Cancellare i tuoi dati?')
      .setDescription(truncate('Verranno rimossi da **questo server**: livelli, monete, rep, warn e ricordi del cervello. Ticket chiusi e casi moderazione saranno anonimizzati. I ticket **aperti** restano finché aperti.\n\nConfermi?', 4000))
      .setTimestamp();
    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => null);
    let msg = null;
    try {
      msg = await interaction.fetchReply();
    } catch { return; }
    if (!msg || typeof msg.createMessageComponentCollector !== 'function') return;
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.user.id === uid && (i.customId === 'mydata_yes' || i.customId === 'mydata_no'),
    });
    collector.on('collect', async (i) => {
      try {
        if (i.customId === 'mydata_no') {
          await i.update({ content: '✅ Annullato: nessun dato toccato.', embeds: [], components: [] }).catch(() => {});
        } else {
          let res = { removed: [], kept: [] };
          try {
            res = forgetData(gid, uid);
          } catch {}
          const lines = [
            res.removed.length ? `Rimossi: ${res.removed.join(', ')}` : 'Nessun dato da rimuovere.',
            ...res.kept.map((k) => `Mantenuti: ${k}`),
          ];
          await i.update({ content: `🧹 ${truncate(lines.join('\n'), 1500)}`, embeds: [], components: [] }).catch(() => {});
        }
      } catch {}
      try { collector.stop(); } catch {}
    });
    collector.on('end', async () => {
      try {
        await msg.edit({ components: [] }).catch(() => {});
      } catch {}
    });
  },
};
