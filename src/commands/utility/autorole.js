const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { getConfig, setConfig, addRole, removeRole } = require('../../database/autorole');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}

function statoEmbed(guild, cfg) {
  const stato = cfg.enabled ? '✅ ATTIVO 🟢' : '❌ DISATTIVO 🔴';
  const ruoli = cfg.roleIds.length
    ? cfg.roleIds.map((id) => `<@&${id}>`).join(' ').slice(0, 1000)
    : '— (nessun ruolo configurato)';
  const title = `🎭 Autorole — ${stato}`.slice(0, 256);
  const desc = `👥 **Ruoli (${cfg.roleIds.length}):**\n${ruoli}\n\n⏳ Ritardo: **${cfg.delaySeconds}s**\n💡 *I nuovi membri ricevono questi ruoli in automatico!*`;
  let embed;
  if (cfg.enabled && theme?.ok) embed = theme.ok(title, desc);
  else if (theme?.info) embed = theme.info(title, desc, cfg.enabled ? theme.COLORS.success : 0x99aab5);
  else {
    embed = new EmbedBuilder()
      .setColor(cfg.enabled ? 0x57f287 : 0x99aab5)
      .setTitle(title)
      .setDescription(desc.slice(0, 4000))
      .setTimestamp();
  }
  try {
    embed.setFooter({ text: String(guild?.name ?? 'Autorole').slice(0, 200) });
  } catch {
    // ignora
  }
  return embed;
}

function errorEmbed(text) {
  if (theme?.err) return theme.err(text);
  return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text ?? '').slice(0, 4000)).setTimestamp();
}

function hasManageRoles(interaction) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  try {
    return Boolean(perms?.has(PermissionFlagsBits.ManageRoles));
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Gestisci i ruoli assegnati automaticamente ai nuovi membri')
    .addSubcommand((s) =>
      s.setName('aggiungi').setDescription('Aggiungi un ruolo automatico per i nuovi membri')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da assegnare').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi un ruolo automatico')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da rimuovere').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('lista').setDescription("Mostra lo stato attuale dell'autorole")
    )
    .addSubcommand((s) =>
      s.setName('attiva').setDescription("Attiva o disattiva l'autorole")
        .addBooleanOption((o) => o.setName('stato').setDescription('true = attivo, false = disattivo').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  cooldown: 3,
  async execute(interaction) {
    try {
      // FIX: in DM interaction.guild è null → il vecchio codice lanciava TypeError non catturato.
      if (!interaction.guild) {
        return interaction.reply({ embeds: [errorEmbed('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      // FIX: setDefaultMemberPermissions è solo un default visibile; il controllo runtime mancava del tutto.
      if (!hasManageRoles(interaction)) {
        return interaction.reply({ embeds: [errorEmbed('Ti serve il permesso **Gestisci Ruoli** per usare questo comando.')], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (sub === 'lista') {
        const cfg = getConfig(guildId);
        return interaction.reply({ embeds: [statoEmbed(interaction.guild, cfg)], flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      if (sub === 'attiva') {
        const stato = interaction.options.getBoolean('stato');
        const cfg = setConfig(guildId, { enabled: stato });
        return interaction.reply({
          content: `🎭 Autorole **${stato ? 'attivato 🟢' : 'disattivato 🔴'}**.`,
          embeds: [statoEmbed(interaction.guild, cfg)],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }

      if (sub === 'aggiungi') {
        const ruolo = interaction.options.getRole('ruolo');
        if (!ruolo) {
          return interaction.reply({ embeds: [errorEmbed('Ruolo non valido.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        if (ruolo.id === interaction.guild.id) {
          return interaction.reply({ embeds: [errorEmbed('Non puoi usare il ruolo @everyone come autorole.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        if (ruolo.managed) {
          return interaction.reply({ embeds: [errorEmbed('Questo ruolo è gestito da un’integrazione e non può essere assegnato automaticamente.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        if (!ruolo.editable) {
          return interaction.reply({ embeds: [errorEmbed('Non posso assegnare questo ruolo: è sopra il mio ruolo più alto o mi mancano i permessi. Sposta il mio ruolo più in alto.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        // FIX: interaction.member può essere null (cache/partial) → il vecchio codice lanciava su me.roles.highest.
        const me = interaction.member;
        const myHighest = me?.roles?.highest;
        const isOwner = interaction.guild.ownerId === interaction.user.id;
        let isAdmin = false;
        try {
          isAdmin = Boolean(me?.permissions?.has(PermissionFlagsBits.Administrator));
        } catch {
          isAdmin = false;
        }
        if (!isOwner && !isAdmin) {
          if (!myHighest) {
            return interaction.reply({ embeds: [errorEmbed('Impossibile verificare la gerarchia ruoli: riprova tra poco.')], flags: MessageFlags.Ephemeral }).catch(() => null);
          }
          if (ruolo.position >= myHighest.position) {
            return interaction.reply({ embeds: [errorEmbed('Non puoi impostare come autorole un ruolo pari o superiore al tuo.')], flags: MessageFlags.Ephemeral }).catch(() => null);
          }
        }
        const { added, config } = addRole(guildId, ruolo.id);
        if (!added) {
          return interaction.reply({ content: `⚠️ ${ruolo} è già tra i ruoli automatici.`, embeds: [statoEmbed(interaction.guild, config)], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        return interaction.reply({
          content: `✅ ${ruolo} verrà assegnato ai nuovi membri.`,
          embeds: [statoEmbed(interaction.guild, config)],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }

      if (sub === 'rimuovi') {
        const ruolo = interaction.options.getRole('ruolo');
        if (!ruolo) {
          return interaction.reply({ embeds: [errorEmbed('Ruolo non valido.')], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        const { removed, config } = removeRole(guildId, ruolo.id);
        if (!removed) {
          return interaction.reply({ content: `⚠️ ${ruolo} non è tra i ruoli automatici.`, embeds: [statoEmbed(interaction.guild, config)], flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        return interaction.reply({
          content: `✅ ${ruolo} rimosso dai ruoli automatici.`,
          embeds: [statoEmbed(interaction.guild, config)],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? 'sconosciuto');
      const clean = msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;
      const payload = { embeds: [errorEmbed(`Errore: ${clean}`)], flags: MessageFlags.Ephemeral };
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
