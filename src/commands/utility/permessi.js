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
  getCommandRoles,
  getAll,
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

      // Scritture di configurazione (imposta/rimuovi/reset):
      // si fanno solo dalla dashboard web (sezione Permessi), mai dal comando.
      if (sub === 'imposta' || sub === 'rimuovi' || sub === 'reset') {
        const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
        const url = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
        return interaction.reply({ content: `La configurazione si fa dalla dashboard: ${url} — sezione Permessi`, flags: MessageFlags.Ephemeral }).catch(() => null);
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

      // Qualsiasi altro subcommand non gestito: rimanda alla dashboard.
      {
        const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
        const url = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
        return interaction.reply({ content: `La configurazione si fa dalla dashboard: ${url} — sezione Permessi`, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
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
