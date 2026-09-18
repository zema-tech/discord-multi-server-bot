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

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}

const truncate = theme?.truncate ?? ((s, max) => String(s ?? '').slice(0, max));

const COMMAND_RE = /^[\w-]{1,32}$/;

function normComando(input) {
  const n = String(input || '').toLowerCase().trim();
  return COMMAND_RE.test(n) ? n : null;
}

function mentionRoles(roleIds) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) return '—';
  return roleIds.map((id) => `<@&${id}>`).join(' ');
}

function withFooter(embed, interaction) {
  if (theme?.applyFooter) {
    try {
      theme.applyFooter(embed, interaction);
    } catch {
      // footer non critico
    }
    return embed;
  }
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente'}` });
  } catch {
    // ignora
  }
  return embed;
}

function errorEmbed(text) {
  if (theme?.err) return theme.err(text);
  return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text ?? '').slice(0, 4000)).setTimestamp();
}

function listEmbed(title, description, color = 0x5865f2) {
  if (theme?.info) return theme.info(title, description, color);
  return new EmbedBuilder().setColor(color).setTitle(String(title).slice(0, 256)).setDescription(String(description).slice(0, 4000)).setTimestamp();
}

function hasManageGuild(interaction) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  try {
    return Boolean(perms?.has(PermissionFlagsBits.ManageGuild));
  } catch {
    return false;
  }
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
      return interaction.reply({ embeds: [errorEmbed('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (!hasManageGuild(interaction)) {
      return interaction.reply({ embeds: [errorEmbed('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'imposta') {
        const comando = normComando(interaction.options.getString('comando'));
        if (!comando) {
          return interaction.reply({
            embeds: [errorEmbed('Nome comando non valido: usa 1-32 caratteri (lettere, numeri, `_` o `-`, senza slash).')],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        if (comando === 'permessi') {
          return interaction.reply({
            embeds: [errorEmbed('Non puoi limitare `/permessi`: resta riservato a chi ha **Gestisci Server** (o Amministratore).')],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        const ruoli = [
          interaction.options.getRole('ruolo'),
          interaction.options.getRole('ruolo2'),
          interaction.options.getRole('ruolo3'),
          interaction.options.getRole('ruolo4'),
          interaction.options.getRole('ruolo5'),
        ].filter(Boolean);
        if (ruoli.some((r) => r.id === guildId)) {
          return interaction.reply({ embeds: [errorEmbed('Non puoi usare @everyone: scegli ruoli specifici.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        const ids = [...new Set(ruoli.map((r) => r.id))].slice(0, MAX_ROLES);
        try {
          setCommandRoles(guildId, comando, ids);
        } catch (e) {
          return interaction.reply({ embeds: [errorEmbed(e?.message || 'Errore nel salvataggio.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        const embed = withFooter(listEmbed(
          `🔐 Permessi impostati — \`/${comando}\``,
          `Da ora solo chi ha almeno uno di questi ruoli può usare \`/${comando}\` (gli **Amministratori** restano sempre esclusi dal blocco).\n\n🎭 Ruoli: ${mentionRoles(ids)}`,
          theme?.COLORS?.success ?? 0x57f287
        ), interaction);
        return interaction.reply({ embeds: [embed] }).catch(() => null);
      }

      if (sub === 'rimuovi') {
        const comando = normComando(interaction.options.getString('comando'));
        if (!comando) {
          return interaction.reply({
            embeds: [errorEmbed('Nome comando non valido: usa 1-32 caratteri (lettere, numeri, `_` o `-`, senza slash).')],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        const attuali = getCommandRoles(guildId, comando);
        if (attuali.length === 0) {
          return interaction.reply({
            embeds: [listEmbed(`🔐 Permessi — \`/${comando}\``, `\`/${comando}\` non ha permessi personalizzati: usa già i permessi Discord standard.`)],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        const ruolo = interaction.options.getRole('ruolo');
        if (!ruolo) {
          clearCommandRoles(guildId, comando);
          const embed = withFooter(listEmbed(
            `🗑️ Permessi resettati — \`/${comando}\``,
            `\`/${comando}\` torna ai permessi Discord standard (nessun ruolo custom richiesto).`,
            theme?.COLORS?.warn ?? 0xfee75c
          ), interaction);
          return interaction.reply({ embeds: [embed] }).catch(() => null);
        }
        if (!attuali.includes(ruolo.id)) {
          return interaction.reply({
            embeds: [listEmbed(`🔐 Permessi — \`/${comando}\``, `${ruolo} non è tra i ruoli autorizzati per \`/${comando}\`.\n🎭 Ruoli attuali: ${mentionRoles(attuali)}`)],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        const restanti = attuali.filter((id) => id !== ruolo.id);
        if (restanti.length === 0) {
          clearCommandRoles(guildId, comando);
          return interaction.reply({
            embeds: [withFooter(listEmbed(`🗑️ Permessi resettati — \`/${comando}\``, `Rimosso l'ultimo ruolo: \`/${comando}\` torna ai permessi Discord standard.`, theme?.COLORS?.warn ?? 0xfee75c), interaction)],
          }).catch(() => null);
        }
        setCommandRoles(guildId, comando, restanti);
        return interaction.reply({
          embeds: [
            withFooter(listEmbed(
              `✅ Ruolo rimosso — \`/${comando}\``,
              `Rimosso ${ruolo}.\n\n🎭 Ruoli restanti: ${mentionRoles(restanti)}`,
              theme?.COLORS?.success ?? 0x57f287
            ), interaction),
          ],
        }).catch(() => null);
      }

      if (sub === 'mostra') {
        const filtro = interaction.options.getString('comando');
        if (filtro) {
          const comando = normComando(filtro);
          if (!comando) {
            return interaction.reply({
              embeds: [errorEmbed('Nome comando non valido: usa 1-32 caratteri (lettere, numeri, `_` o `-`, senza slash).')],
              flags: MessageFlags.Ephemeral,
            }).catch(() => null);
          }
          const ruoli = getCommandRoles(guildId, comando);
          if (ruoli.length === 0) {
            return interaction.reply({
              embeds: [listEmbed(`🔐 Permessi — \`/${comando}\``, `\`/${comando}\` non ha permessi personalizzati: vale solo la configurazione Discord standard.`)],
              flags: MessageFlags.Ephemeral,
            }).catch(() => null);
          }
          return interaction.reply({
            embeds: [
              withFooter(listEmbed(
                `🔐 Permessi — \`/${comando}\``,
                `🎭 Ruoli autorizzati: ${mentionRoles(ruoli)}\n\n👑 Gli Amministratori possono sempre usare il comando.`
              ), interaction),
            ],
          }).catch(() => null);
        }
        const tutti = getAll(guildId);
        const nomi = Object.keys(tutti).sort();
        if (nomi.length === 0) {
          return interaction.reply({
            embeds: [listEmbed('🔐 Permessi personalizzati', 'Nessun permesso personalizzato in questo server.\n💡 Usa `/permessi imposta` per limitare un comando a certi ruoli.')],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        const righe = nomi.map((cmd) => `🔐 \`/${cmd}\` → ${mentionRoles(tutti[cmd].roleIds)}`).join('\n');
        return interaction.reply({
          embeds: [
            withFooter(listEmbed(
              `🔐 Permessi personalizzati (${nomi.length})`,
              truncate(`✨ **${nomi.length} comandi protetti** in questo server:\n\n${righe}\n\n👑 Gli Amministratori restano sempre esclusi dal blocco.`, 4000)
            ), interaction),
          ],
        }).catch(() => null);
      }

      // sub === 'reset'
      const tutti = getAll(guildId);
      if (Object.keys(tutti).length === 0) {
        return interaction.reply({ embeds: [listEmbed('🔐 Permessi personalizzati', 'Niente da resettare: nessun permesso personalizzato in questo server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
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
            theme?.COLORS?.error ?? 0xed4245
          ),
        ],
        components: [row],
        withResponse: true,
      }).catch(() => null);
      if (!reply) return null;
      // FIX: reply.resource.message può mancare (versioni diverse di discord.js) → fallback a fetchReply.
      const message = reply?.resource?.message ?? await interaction.fetchReply().catch(() => null);
      if (!message || typeof message.createMessageComponentCollector !== 'function') return null;

      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i) => i.customId.startsWith(prefix),
      });

      collector.on('collect', async (i) => {
        if (i.user.id !== uid) {
          return i.reply({ content: '❌ Solo chi ha avviato il comando può confermare.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        if (i.customId === `${prefix}:no`) {
          collector.stop('annullato');
          return i.update({ content: '✅ Reset annullato: nessuna modifica.', embeds: [], components: [] }).catch(() => null);
        }
        collector.stop('confermato');
        clearAll(guildId);
        return i.update({ content: '🗑️ Tutti i permessi personalizzati sono stati azzerati.', embeds: [], components: [] }).catch(() => null);
      });

      collector.on('end', async (_collected, reason) => {
        if (reason === 'confermato' || reason === 'annullato') return;
        const disabled = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${prefix}:si:fin`).setLabel('Conferma reset').setStyle(ButtonStyle.Danger).setDisabled(true),
          new ButtonBuilder().setCustomId(`${prefix}:no:fin`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await interaction.editReply({ content: '⏰ Tempo scaduto: nessuna modifica applicata.', embeds: [], components: [disabled] }).catch(() => {});
      });
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? 'sconosciuto');
      const payload = { embeds: [errorEmbed(`Errore: ${truncate(msg, 1500)}`)], flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
        else await interaction.reply(payload).catch(() => null);
      } catch {
        // mai lanciare
      }
      return null;
    }
  },
};
