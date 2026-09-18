const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { TEMPLATES, validateBlueprint, applyBlueprint, describeBlueprint } = require('../../utils/blueprints');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    COLORS: { primary: 0x5865f2, success: 0x57f287, warn: 0xfee75c, error: 0xed4245 },
    err: (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t).slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}
const { COLORS } = theme;

const TEMPLATE_CHOICES = Object.keys(TEMPLATES);

function previewEmbed(key) {
  const t = TEMPLATES[key];
  const v = validateBlueprint(t);
  const channelTotal = v.blueprint ? v.blueprint.categories.reduce((n, c) => n + c.channels.length, 0) : 0;
  return new EmbedBuilder()
    .setColor(COLORS.primary ?? 0x5865f2)
    .setTitle(`📐 Template ${t.label}`.slice(0, 256))
    .setDescription(
      `✨ *${theme.truncate(t.description, 500)}*\n\n${theme.truncate(describeBlueprint(v.blueprint || t), 3000)}\n\n🎭 Ruoli: **${t.roles.length}** • 💬🔊 Canali: **${channelTotal}**`
    )
    .setFooter({ text: 'Usa /template applica per creare questa struttura (non cancella nulla di esistente)'.slice(0, 200) })
    .setTimestamp();
}

function confirmRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:si`).setLabel('Conferma').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${prefix}:no`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
  );
}

function disabledRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:si:fin`).setLabel('Conferma').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId(`${prefix}:no:fin`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
}

function botCanBuild(guild) {
  const me = guild.members.me;
  if (!me) return false;
  return (
    me.permissions.has(PermissionFlagsBits.ManageRoles) && me.permissions.has(PermissionFlagsBits.ManageChannels)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Applica un template di struttura al server (stile PeakBot)')
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra i template disponibili'))
    .addSubcommand((s) =>
      s
        .setName('anteprima')
        .setDescription('Mostra la struttura di un template senza crearla')
        .addStringOption((o) =>
          o.setName('nome').setDescription('Quale template').setRequired(true)
            .addChoices(...TEMPLATE_CHOICES.map((k) => ({ name: `${TEMPLATES[k].label} (${k})`, value: k })))
        )
    )
    .addSubcommand((s) =>
      s
        .setName('applica')
        .setDescription('Crea ruoli e canali del template (non cancella nulla)')
        .addStringOption((o) =>
          o.setName('nome').setDescription('Quale template').setRequired(true)
            .addChoices(...TEMPLATE_CHOICES.map((k) => ({ name: `${TEMPLATES[k].label} (${k})`, value: k })))
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 10,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'lista') {
      const lines = TEMPLATE_CHOICES.map((k) => {
        const t = TEMPLATES[k];
        const ch = t.categories.reduce((n, c) => n + c.channels.length, 0);
        return `${t.label} — \`${k}\`: ${t.description} (**${t.roles.length}** ruoli, **${ch}** canali)`;
      });
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary ?? 0x5865f2)
        .setTitle('📐 Template disponibili')
        .setDescription(`${theme.truncate(lines.join('\n\n'), 3500)}\n\n👁️ \`/template anteprima nome:<id>\` per vedere la struttura.`)
        .setTimestamp();
      theme.applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed] });
    }

    const nome = interaction.options.getString('nome');
    const tpl = TEMPLATES[nome];
    if (!tpl) {
      return interaction.reply({ embeds: [theme.err('Template sconosciuto. Usa `/template lista`.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'anteprima') {
      const prev = previewEmbed(nome);
      theme.applyFooter(prev, interaction);
      return interaction.reply({ embeds: [prev] });
    }

    // sub === 'applica'
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [theme.err('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
    }
    if (!botCanBuild(interaction.guild)) {
      return interaction.reply({
        embeds: [theme.err('Mi servono i permessi **Gestisci Ruoli** e **Gestisci Canali** per applicare il template.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const uid = interaction.user.id;
    const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const prefix = `template:${uid}:${nonce}`;

    const reply = await interaction.reply({
      embeds: [previewEmbed(nome)],
      content: `⚠️ Creare la struttura **${tpl.label}** in questo server? Non verrà cancellato nulla di esistente. Hai 60 secondi.`,
      components: [confirmRow(prefix)],
      withResponse: true,
    });
    // FIX collector: reply.resource.message può essere undefined (versioni discord.js diverse);
    // senza fallback il collector su undefined lanciava e il comando restava appeso senza riepilogo.
    const message = reply?.resource?.message ?? reply?.message ?? await interaction.fetchReply().catch(() => null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') {
      return interaction.followUp({ embeds: [theme.err('Impossibile aprire la conferma: riprova tra poco.')] }).catch(() => {});
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.customId.startsWith(prefix),
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== uid) {
        return i.reply({ content: '❌ Solo chi ha avviato il comando può confermare.', flags: MessageFlags.Ephemeral });
      }
      if (i.customId === `${prefix}:no`) {
        collector.stop('annullato');
        return i.update({ content: '✅ Applicazione template annullata.', embeds: [], components: [] });
      }
      // Conferma: operazione lunga → defer + edit finale.
      collector.stop('confermato');
      await i.deferUpdate();
      let report;
      try {
        report = await applyBlueprint(interaction.guild, tpl, `Template ${nome} | Mod: ${interaction.user.tag}`);
      } catch (e) {
        return interaction.editReply({
          content: `❌ Errore: ${e.message || e}`,
          embeds: [],
          components: [],
        });
      }
      const okLines = [
        `🎭 Ruoli creati: **${report.roles.length}**${report.roles.length ? ` (${report.roles.map((r) => r.name).join(', ')})` : ''}`,
        `📁💬 Canali/categorie creati: **${report.channels.length}**`,
      ];
      const failLines =
        report.failed.length > 0
          ? `\n⚠️ Non riusciti (**${report.failed.length}**):\n${report.failed.slice(0, 10).map((f) => `• ${f.cosa}: ${f.errore}`).join('\n')}`
          : '\n✅ Tutto creato senza errori.';
      const done = new EmbedBuilder()
        .setColor(report.failed.length ? COLORS.warn ?? 0xfee75c : COLORS.success ?? 0x57f287)
        .setTitle(`✅ Template ${tpl.label} applicato`)
        .setDescription(`${okLines.join('\n')}${failLines}`.slice(0, 4000))
        .setFooter({ text: `Richiesto da ${interaction.user.tag}`.slice(0, 200) })
        .setTimestamp();
      await interaction.editReply({ content: '', embeds: [done], components: [] });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'confermato' || reason === 'annullato') return;
      await interaction
        .editReply({ content: '⏰ Tempo scaduto: nessuna modifica applicata.', components: [disabledRow(prefix)] })
        .catch(() => {});
    });
  },
};
