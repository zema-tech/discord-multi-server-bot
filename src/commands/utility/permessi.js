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
const {
  MAX_ROLES,
  getCommandRoles,
  setCommandRoles,
  clearCommandRoles,
  getAll,
  clearAll,
} = require('../../database/customPerms');

const COMMAND_RE = /^[\w-]{1,32}$/;

function normComando(input) {
  const n = String(input || '').toLowerCase().trim();
  return COMMAND_RE.test(n) ? n : null;
}

function mentionRoles(roleIds) {
  return roleIds.map((id) => `<@&${id}>`).join(' ');
}

function listEmbed(title, description, color = 0x5865f2) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permessi')
    .setDescription('Permessi personalizzati: limita i comandi a ruoli specifici (stile PeakBot)')
    .addSubcommand((s) =>
      s
        .setName('imposta')
        .setDescription('Consenti un comando solo a certi ruoli (max 5)')
        .addStringOption((o) =>
          o.setName('comando').setDescription('Nome comando senza slash (es. nuke)').setRequired(true).setMaxLength(32)
        )
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo autorizzato').setRequired(true))
        .addRoleOption((o) => o.setName('ruolo2').setDescription('Ruolo extra (facoltativo)').setRequired(false))
        .addRoleOption((o) => o.setName('ruolo3').setDescription('Ruolo extra (facoltativo)').setRequired(false))
        .addRoleOption((o) => o.setName('ruolo4').setDescription('Ruolo extra (facoltativo)').setRequired(false))
        .addRoleOption((o) => o.setName('ruolo5').setDescription('Ruolo extra (facoltativo)').setRequired(false))
    )
    .addSubcommand((s) =>
      s
        .setName('rimuovi')
        .setDescription('Togli un ruolo da un comando, o resetta il comando (senza ruolo)')
        .addStringOption((o) =>
          o.setName('comando').setDescription('Nome comando senza slash').setRequired(true).setMaxLength(32)
        )
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da togliere (vuoto = reset comando)').setRequired(false))
    )
    .addSubcommand((s) =>
      s
        .setName('mostra')
        .setDescription('Mostra i permessi personalizzati (di un comando o di tutti)')
        .addStringOption((o) =>
          o.setName('comando').setDescription('Nome comando senza slash (vuoto = tutti)').setRequired(false).setMaxLength(32)
        )
    )
    .addSubcommand((s) => s.setName('reset').setDescription('Azzera TUTTI i permessi personalizzati (con conferma)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci Server**.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'imposta') {
      const comando = normComando(interaction.options.getString('comando'));
      if (!comando) {
        return interaction.reply({
          content: '❌ Nome comando non valido: usa 1-32 caratteri (lettere, numeri, `_` o `-`, senza slash).',
          flags: MessageFlags.Ephemeral,
        });
      }
      if (comando === 'permessi') {
        return interaction.reply({
          content: '❌ Non puoi limitare `/permessi`: resta riservato a chi ha **Gestisci Server** (o Amministratore).',
          flags: MessageFlags.Ephemeral,
        });
      }
      const ruoli = [
        interaction.options.getRole('ruolo'),
        interaction.options.getRole('ruolo2'),
        interaction.options.getRole('ruolo3'),
        interaction.options.getRole('ruolo4'),
        interaction.options.getRole('ruolo5'),
      ].filter(Boolean);
      if (ruoli.some((r) => r.id === guildId)) {
        return interaction.reply({ content: '❌ Non puoi usare @everyone: scegli ruoli specifici.', flags: MessageFlags.Ephemeral });
      }
      const ids = [...new Set(ruoli.map((r) => r.id))].slice(0, MAX_ROLES);
      try {
        setCommandRoles(guildId, comando, ids);
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message || 'Errore nel salvataggio.'}`, flags: MessageFlags.Ephemeral });
      }
      const embed = listEmbed(
        `🔐 Permessi impostati — \`/${comando}\``,
        `Da ora solo chi ha almeno uno di questi ruoli può usare \`/${comando}\` (gli **Amministratori** restano sempre esclusi dal blocco).\n\n🎭 Ruoli: ${mentionRoles(ids)}`,
        0x57f287
      ).setFooter({ text: `Richiesto da ${interaction.user.tag}` });
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'rimuovi') {
      const comando = normComando(interaction.options.getString('comando'));
      if (!comando) {
        return interaction.reply({
          content: '❌ Nome comando non valido: usa 1-32 caratteri (lettere, numeri, `_` o `-`, senza slash).',
          flags: MessageFlags.Ephemeral,
        });
      }
      const attuali = getCommandRoles(guildId, comando);
      if (attuali.length === 0) {
        return interaction.reply({
          content: `ℹ️ \`/${comando}\` non ha permessi personalizzati: usa già i permessi Discord standard.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const ruolo = interaction.options.getRole('ruolo');
      if (!ruolo) {
        clearCommandRoles(guildId, comando);
        const embed = listEmbed(
          `🗑️ Permessi resettati — \`/${comando}\``,
          `\`/${comando}\` torna ai permessi Discord standard (nessun ruolo custom richiesto).`,
          0xfee75c
        ).setFooter({ text: `Richiesto da ${interaction.user.tag}` });
        return interaction.reply({ embeds: [embed] });
      }
      if (!attuali.includes(ruolo.id)) {
        return interaction.reply({
          content: `ℹ️ ${ruolo} non è tra i ruoli autorizzati per \`/${comando}\`.\n🎭 Ruoli attuali: ${mentionRoles(attuali)}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const restanti = attuali.filter((id) => id !== ruolo.id);
      if (restanti.length === 0) {
        clearCommandRoles(guildId, comando);
        return interaction.reply({
          embeds: [listEmbed(`🗑️ Permessi resettati — \`/${comando}\``, `Rimosso l'ultimo ruolo: \`/${comando}\` torna ai permessi Discord standard.`, 0xfee75c)],
        });
      }
      setCommandRoles(guildId, comando, restanti);
      return interaction.reply({
        embeds: [
          listEmbed(
            `✅ Ruolo rimosso — \`/${comando}\``,
            `Rimosso ${ruolo}.\n\n🎭 Ruoli restanti: ${mentionRoles(restanti)}`,
            0x57f287
          ),
        ],
      });
    }

    if (sub === 'mostra') {
      const filtro = interaction.options.getString('comando');
      if (filtro) {
        const comando = normComando(filtro);
        if (!comando) {
          return interaction.reply({
            content: '❌ Nome comando non valido: usa 1-32 caratteri (lettere, numeri, `_` o `-`, senza slash).',
            flags: MessageFlags.Ephemeral,
          });
        }
        const ruoli = getCommandRoles(guildId, comando);
        if (ruoli.length === 0) {
          return interaction.reply({
            content: `ℹ️ \`/${comando}\` non ha permessi personalizzati: vale solo la configurazione Discord standard.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [
            listEmbed(
              `🔐 Permessi — \`/${comando}\``,
              `🎭 Ruoli autorizzati: ${mentionRoles(ruoli)}\n\n👑 Gli Amministratori possono sempre usare il comando.`
            ),
          ],
        });
      }
      const tutti = getAll(guildId);
      const nomi = Object.keys(tutti).sort();
      if (nomi.length === 0) {
        return interaction.reply({
          content: 'ℹ️ Nessun permesso personalizzato in questo server.\n💡 Usa `/permessi imposta` per limitare un comando a certi ruoli.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const righe = nomi.map((cmd) => `\`/${cmd}\` → ${mentionRoles(tutti[cmd].roleIds)}`).join('\n');
      return interaction.reply({
        embeds: [
          listEmbed(
            `🔐 Permessi personalizzati (${nomi.length})`,
            `${righe}\n\n👑 Gli Amministratori restano sempre esclusi dal blocco.`
          ),
        ],
      });
    }

    // sub === 'reset'
    const tutti = getAll(guildId);
    if (Object.keys(tutti).length === 0) {
      return interaction.reply({ content: 'ℹ️ Niente da resettare: nessun permesso personalizzato in questo server.', flags: MessageFlags.Ephemeral });
    }
    const uid = interaction.user.id;
    const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const prefix = `permessi:${uid}:${nonce}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${prefix}:si`).setLabel('Conferma reset').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`${prefix}:no`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
    );
    const reply = await interaction.reply({
      embeds: [
        listEmbed(
          '⚠️ Reset permessi personalizzati',
          `Stai per azzerare **${Object.keys(tutti).length}** configurazioni: tutti i comandi torneranno ai permessi Discord standard.\n\nHai **30 secondi** per confermare.`,
          0xed4245
        ),
      ],
      components: [row],
      withResponse: true,
    });
    const message = reply.resource.message;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.customId.startsWith(prefix),
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== uid) {
        return i.reply({ content: '❌ Solo chi ha avviato il comando può confermare.', flags: MessageFlags.Ephemeral });
      }
      if (i.customId === `${prefix}:no`) {
        collector.stop('annullato');
        return i.update({ content: '✅ Reset annullato: nessuna modifica.', embeds: [], components: [] });
      }
      collector.stop('confermato');
      clearAll(guildId);
      return i.update({ content: '🗑️ Tutti i permessi personalizzati sono stati azzerati.', embeds: [], components: [] });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'confermato' || reason === 'annullato') return;
      const disabled = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${prefix}:si:fin`).setLabel('Conferma reset').setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId(`${prefix}:no:fin`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
      await interaction.editReply({ content: '⏰ Tempo scaduto: nessuna modifica applicata.', embeds: [], components: [disabled] }).catch(() => {});
    });
  },
};
