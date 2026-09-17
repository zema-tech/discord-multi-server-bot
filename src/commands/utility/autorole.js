const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { getConfig, setConfig, addRole, removeRole } = require('../../database/autorole');

function statoEmbed(guild, cfg) {
  const stato = cfg.enabled ? '✅ ATTIVO 🟢' : '❌ DISATTIVO 🔴';
  const ruoli = cfg.roleIds.length
    ? cfg.roleIds.map((id) => `<@&${id}>`).join(' ').slice(0, 1000)
    : '— (nessun ruolo configurato)';
  return new EmbedBuilder()
    .setColor(cfg.enabled ? 0x57f287 : 0x99aab5)
    .setTitle(`🎭 Autorole — ${stato}`.slice(0, 256))
    .setDescription(`👥 **Ruoli (${cfg.roleIds.length}):**\n${ruoli}\n\n⏳ Ritardo: **${cfg.delaySeconds}s**\n💡 *I nuovi membri ricevono questi ruoli in automatico!*`)
    .setFooter({ text: guild.name.slice(0, 200) })
    .setTimestamp();
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
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'lista') {
      const cfg = getConfig(guildId);
      return interaction.reply({ embeds: [statoEmbed(interaction.guild, cfg)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'attiva') {
      const stato = interaction.options.getBoolean('stato');
      const cfg = setConfig(guildId, { enabled: stato });
      return interaction.reply({
        content: `🎭 Autorole **${stato ? 'attivato 🟢' : 'disattivato 🔴'}**.`,
        embeds: [statoEmbed(interaction.guild, cfg)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'aggiungi') {
      const ruolo = interaction.options.getRole('ruolo');
      if (ruolo.id === interaction.guild.id) {
        return interaction.reply({ content: '❌ Non puoi usare il ruolo @everyone come autorole.', flags: MessageFlags.Ephemeral });
      }
      if (ruolo.managed) {
        return interaction.reply({ content: '❌ Questo ruolo è gestito da un’integrazione e non può essere assegnato automaticamente.', flags: MessageFlags.Ephemeral });
      }
      if (!ruolo.editable) {
        return interaction.reply({ content: '❌ Non posso assegnare questo ruolo: è sopra il mio ruolo più alto o mi mancano i permessi. Sposta il mio ruolo più in alto.', flags: MessageFlags.Ephemeral });
      }
      const me = interaction.member;
      const myHighest = me.roles.highest;
      const isOwner = interaction.guild.ownerId === interaction.user.id;
      const isAdmin = me.permissions.has(PermissionFlagsBits.Administrator);
      if (!isOwner && !isAdmin && ruolo.position >= myHighest.position) {
        return interaction.reply({ content: '❌ Non puoi impostare come autorole un ruolo pari o superiore al tuo.', flags: MessageFlags.Ephemeral });
      }
      const { added, config } = addRole(guildId, ruolo.id);
      if (!added) {
        return interaction.reply({ content: `⚠️ ${ruolo} è già tra i ruoli automatici.`, embeds: [statoEmbed(interaction.guild, config)], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: `✅ ${ruolo} verrà assegnato ai nuovi membri.`,
        embeds: [statoEmbed(interaction.guild, config)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'rimuovi') {
      const ruolo = interaction.options.getRole('ruolo');
      const { removed, config } = removeRole(guildId, ruolo.id);
      if (!removed) {
        return interaction.reply({ content: `⚠️ ${ruolo} non è tra i ruoli automatici.`, embeds: [statoEmbed(interaction.guild, config)], flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: `✅ ${ruolo} rimosso dai ruoli automatici.`,
        embeds: [statoEmbed(interaction.guild, config)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
