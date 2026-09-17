const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  PermissionsBitField,
} = require('discord.js');

const MODAL_ID = 'embed_builder';
const BLURPLE = 0x5865f2;
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

function buildRow(uid, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embed_confirm:${uid}`)
      .setLabel('Conferma')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`embed_cancel:${uid}`)
      .setLabel('Annulla')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
      .setDisabled(disabled)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Crea un embed personalizzato con anteprima')
    .addSubcommand((s) =>
      s
        .setName('crea')
        .setDescription('Crea un embed tramite modulo e invialo nel canale scelto')
        .addChannelOption((o) =>
          o
            .setName('canale')
            .setDescription('Canale testuale dove inviare l\u2019embed')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 5,
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'crea') {
      return interaction.reply({ content: '❌ Sottocomando non riconosciuto. Usa `/embed crea`.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Questo comando funziona solo nei server.', flags: MessageFlags.Ephemeral });
    }

    const target = interaction.options.getChannel('canale');
    if (!target || !target.isTextBased()) {
      return interaction.reply({ content: '❌ Scegli un canale testuale valido.', flags: MessageFlags.Ephemeral });
    }
    const me = interaction.guild.members.me;
    const scrivibile =
      target.viewable &&
      target.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks]);
    if (!scrivibile) {
      return interaction.reply({
        content: `❌ Non posso scrivere in ${target} (servono permessi di visualizzare, inviare messaggi e incorporare link).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const uid = interaction.user.id;

    const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Crea embed').addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('titolo')
          .setLabel('Titolo')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('descrizione')
          .setLabel('Descrizione')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('colore')
          .setLabel('Colore hex')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
          .setPlaceholder('#5865F2')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('immagine')
          .setLabel('Immagine URL (opzionale)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('https://…/immagine.png')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer (opzionale)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200)
      )
    );

    try {
      await interaction.showModal(modal);
    } catch {
      return;
    }

    // Modal chiusa senza invio e timeout (180s): awaitModalSubmit scarta in entrambi i casi.
    let modalInteraction;
    try {
      modalInteraction = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === MODAL_ID && i.user.id === uid,
        time: 180000,
      });
    } catch {
      await interaction
        .followUp({ content: '⏰ Tempo scaduto. Rilancia `/embed crea` per ricominciare.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }

    const titolo = modalInteraction.fields.getTextInputValue('titolo').trim();
    const descrizione = modalInteraction.fields.getTextInputValue('descrizione').trim();
    const coloreRaw = modalInteraction.fields.getTextInputValue('colore').trim();
    const immagineRaw = (modalInteraction.fields.getTextInputValue('immagine') || '').trim();
    const footerRaw = (modalInteraction.fields.getTextInputValue('footer') || '').trim();

    const avvisi = [];
    let colore = BLURPLE;
    if (HEX_RE.test(coloreRaw)) {
      colore = parseInt(coloreRaw.replace('#', ''), 16);
    } else {
      avvisi.push(`⚠️ Colore \`${coloreRaw.slice(0, 20) || 'vuoto'}\` non valido: uso il blurple predefinito \`#5865F2\`.`);
    }

    let immagine = null;
    if (immagineRaw) {
      let ok = false;
      try {
        const u = new URL(immagineRaw);
        ok = (u.protocol === 'http:' || u.protocol === 'https:') && IMAGE_EXT_RE.test(u.pathname);
      } catch {
        ok = false;
      }
      if (ok) {
        immagine = immagineRaw;
      } else {
        avvisi.push('⚠️ URL immagine non valido (serve http/https + estensione png/jpg/gif/webp): immagine ignorata.');
      }
    }

    const embed = new EmbedBuilder()
      .setColor(colore)
      .setTitle(titolo.slice(0, 256))
      .setDescription(descrizione.slice(0, 4096))
      .setAuthor({ name: `✨ ${interaction.guild.name}`.slice(0, 256) })
      .setFooter({ text: (footerRaw || `Creato da ${interaction.user.tag}`).slice(0, 200) })
      .setTimestamp();
    if (immagine) embed.setImage(immagine);

    const confirmId = `embed_confirm:${uid}`;
    const cancelId = `embed_cancel:${uid}`;
    const testoAnteprima = `${avvisi.length ? `${avvisi.join('\n')}\n\n` : ''}👀 **Anteprima** — verrà inviato in ${target}. Confermi?`;

    let preview;
    try {
      preview = await modalInteraction.reply({
        content: testoAnteprima,
        embeds: [embed],
        components: [buildRow(uid, false)],
        flags: MessageFlags.Ephemeral,
        withResponse: true,
      });
    } catch {
      return;
    }
    const message = preview.resource.message;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (i) => i.customId === confirmId || i.customId === cancelId,
    });

    let deciso = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== uid) {
        return i.reply({ content: '❌ Questi bottoni sono di un altro utente! Usa `/embed crea` per il tuo.', flags: MessageFlags.Ephemeral });
      }
      // Doppio click: la prima scelta ha già disabilitato i bottoni.
      if (deciso) {
        return i.reply({ content: '⏳ Hai già scelto: richiesta già gestita.', flags: MessageFlags.Ephemeral });
      }
      deciso = true;

      if (i.customId === cancelId) {
        await i.update({ content: '🗑️ Embed scartato: niente è stato inviato.', embeds: [], components: [buildRow(uid, true)] }).catch(() => {});
        collector.stop('annullato');
        return;
      }

      // Conferma: ricontrolla che il canale sia ancora scrivibile.
      await i.update({ content: '⏳ Invio in corso…', embeds: [embed], components: [buildRow(uid, true)] }).catch(() => {});
      try {
        const fresh = await interaction.guild.channels.fetch(target.id).catch(() => target);
        const ok =
          fresh?.isTextBased() &&
          fresh.viewable &&
          fresh.permissionsFor(interaction.guild.members.me)?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks]);
        if (!ok) {
          await i.followUp({ content: `❌ Non posso più scrivere in ${target}. Controlla i permessi e riprova.`, flags: MessageFlags.Ephemeral });
          collector.stop('errore');
          return;
        }
        await fresh.send({ embeds: [embed] });
        await i.followUp({ content: `✅ Embed inviato in ${target}!`, flags: MessageFlags.Ephemeral });
      } catch {
        await i.followUp({ content: '❌ Invio fallito. Controlla i permessi del canale e riprova.', flags: MessageFlags.Ephemeral });
      }
      collector.stop('inviato');
    });

    collector.on('end', async (_collected, reason) => {
      if (deciso || reason === 'inviato' || reason === 'annullato' || reason === 'errore') return;
      await modalInteraction
        .editReply({ content: '⏰ Tempo scaduto: anteprima scartata, niente è stato inviato.', components: [buildRow(uid, true)] })
        .catch(() => {});
    });
  },
};
