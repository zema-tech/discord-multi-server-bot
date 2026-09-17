const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');
const { getItem, setItem, removeItem, listItems } = require('../../database/shop');

function noPerm() {
  return { content: '❌ Ti serve il permesso **Gestisci ruoli** per usare questo comando.', flags: MessageFlags.Ephemeral };
}

// Ruolo vendibile: non @everyone, non gestito da integrazioni, sotto il ruolo più alto del bot.
function validateSellable(role, guild) {
  if (role.id === guild.id) return '❌ Non puoi vendere il ruolo @everyone.';
  if (role.managed) return "❌ Quel ruolo è gestito da un'integrazione e non può essere venduto.";
  if (!role.editable) {
    return '❌ Non posso gestire quel ruolo: è sopra il mio ruolo più alto. Sposta il mio ruolo più in alto nella gerarchia.';
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Negozio ruoli del server')
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra i ruoli in vendita'))
    .addSubcommand((s) =>
      s.setName('compra').setDescription('Compra un ruolo con le tue monete')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da comprare').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('aggiungi').setDescription('Metti un ruolo in vendita (staff)')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da vendere').setRequired(true))
        .addIntegerOption((o) => o.setName('prezzo').setDescription('Prezzo in monete').setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Togli un ruolo dalla vendita (staff)')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da rimuovere').setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'lista') {
      const items = listItems(guildId);
      if (!items.length) {
        return interaction.reply({ content: '📭 Nessun ruolo in vendita. Torna più tardi!', flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🛒 Negozio ruoli')
        .setDescription(items.map((i) => `<@&${i.roleId}> — **${i.price}** 🪙`).join('\n'))
        .setFooter({ text: 'Usa /shop compra per acquistare un ruolo' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'compra') {
      const role = interaction.options.getRole('ruolo');
      const item = getItem(guildId, role.id);
      if (!item) {
        return interaction.reply({ content: `❌ ${role} non è in vendita. Guarda \`/shop lista\`.`, flags: MessageFlags.Ephemeral });
      }
      const invalid = validateSellable(role, interaction.guild);
      if (invalid) return interaction.reply({ content: invalid, flags: MessageFlags.Ephemeral });

      const member = interaction.member;
      if (member.roles.cache.has(role.id)) {
        return interaction.reply({ content: `❌ Possiedi già ${role}.`, flags: MessageFlags.Ephemeral });
      }

      const user = getUser(guildId, interaction.user.id);
      if (!Number.isFinite(user.balance) || user.balance < item.price) {
        return interaction.reply({
          content: `❌ Saldo insufficiente: ${role} costa **${item.price}** 🪙 (hai **${Number.isFinite(user.balance) ? user.balance : 0}** 🪙).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      addBalance(guildId, interaction.user.id, -item.price);
      try {
        await member.roles.add(role);
      } catch {
        // Rimborso: l'addebito è andato a buon fine ma l'assegnazione no.
        addBalance(guildId, interaction.user.id, item.price);
        return interaction.reply({ content: '❌ Non sono riuscito ad assegnarti il ruolo. Sei stato rimborsato.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🛒 Acquisto completato!')
        .setDescription(`${interaction.user} ha acquistato ${role} per **${item.price}** 🪙`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // aggiungi / rimuovi = staff con Gestisci ruoli (controllo interno: i subcommand pubblici restano visibili a tutti).
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply(noPerm());
    }

    const role = interaction.options.getRole('ruolo');

    if (sub === 'rimuovi') {
      const existed = removeItem(guildId, role.id);
      return interaction.reply({
        content: existed ? `✅ ${role} rimosso dalla vendita.` : `ℹ️ ${role} non era in vendita.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // sub === 'aggiungi'
    const invalid = validateSellable(role, interaction.guild);
    if (invalid) return interaction.reply({ content: invalid, flags: MessageFlags.Ephemeral });
    const price = interaction.options.getInteger('prezzo');
    setItem(guildId, role.id, price);
    return interaction.reply({ content: `✅ ${role} ora in vendita a **${price}** 🪙.`, flags: MessageFlags.Ephemeral });
  },
};
