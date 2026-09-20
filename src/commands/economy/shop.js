const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');
const { getItem, listItems } = require('../../database/shop');

// theme.js con fallback inline: mai crash se il require fallisce.
let _T = null;
try { _T = require('../../utils/theme'); } catch { _T = null; }
const COLORS = _T?.COLORS ?? { gold: 0xffd700, success: 0x57f287, primary: 0x5865f2 };
const applyFooter = _T?.applyFooter ?? ((embed, interaction) => {
  try { embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { embed.setTimestamp(); } catch { /* ignora */ }
  return embed;
});
const num = _T?.num ?? ((n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d'));
const truncate = _T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

function noPerm() {
  return { content: '❌ Ti serve il permesso **Gestisci ruoli** per usare questo comando.', flags: MessageFlags.Ephemeral };
}

function dashboardMsg(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  const dest = base ? `${base}/app.html#gid=${guildId}` : 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${dest} — sezione ${sezione}`;
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
      // Slice anti-limite 4096 char: con tanti ruoli la description esploderebbe.
      const MAX = 25;
      const righe = items.slice(0, MAX).map((i) => `<@&${i.roleId}> — **${num(i.price)}** 🪙`);
      if (items.length > MAX) righe.push(`…e altri **${num(items.length - MAX)}** ruoli.`);
      const embed = applyFooter(new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('🛒 Negozio ruoli')
        .setDescription(truncate(righe.join('\n'), 4096)), interaction);
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
          content: `❌ Saldo insufficiente: ${role} costa **${num(item.price)}** 🪙 (hai **${num(user.balance)}** 🪙).`,
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

      const embed = applyFooter(new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🛒 Acquisto completato!')
        .setDescription(`${interaction.user} ha acquistato ${role} per **${num(item.price)}** 🪙`), interaction);
      return interaction.reply({ embeds: [embed] });
    }

    // aggiungi / rimuovi = solo dalla dashboard (nessuna scrittura qui).
    if (sub === 'aggiungi' || sub === 'rimuovi') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply(noPerm());
      }
      return interaction.reply({ content: dashboardMsg(guildId, 'Negozio'), flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: '❌ Sottocomando sconosciuto.', flags: MessageFlags.Ephemeral });
  },
};
