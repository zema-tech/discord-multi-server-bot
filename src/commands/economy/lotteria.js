const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');
const { getState, addTickets, totalTickets, resetLottery } = require('../../database/lotteria');

const MAX_TICKETTI_PER_VOLTA = 5;
const MIN_TICKETTI_ESTRAZIONE_MANUALE = 3;

// Anti-race: una sola estrazione alla volta per guild.
const drawing = new Set();

// Vincitore random pesato sul numero di biglietti posseduti.
function pickWinnerWeighted(entries) {
  const bag = [];
  for (const [userId, count] of Object.entries(entries)) {
    for (let i = 0; i < count; i++) bag.push(userId);
  }
  if (!bag.length) return null;
  return bag[Math.floor(Math.random() * bag.length)];
}

function partyEmbed(winnerId, prize, total) {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle('🎉 ABBIAMO UN VINCITORE! 🎉')
    .setDescription(`🥳 Congratulazioni <@${winnerId}>!\n\nHai vinto **${prize}** 🪙 con **${total}** biglietti totali in gioco!`)
    .setTimestamp();
}

// Esegue l'estrazione sullo stato attuale: sceglie il vincitore, resetta e accredita il piatto.
// Ritorna { winnerId, prize, total } oppure null se non c'è nulla da estrarre.
async function runDraw(guildId) {
  const state = getState(guildId);
  const total = Object.values(state.entries).reduce((a, b) => a + b, 0);
  if (total === 0 || state.pot <= 0) return null;
  const winnerId = pickWinnerWeighted(state.entries);
  if (!winnerId) return null;
  const prize = state.pot;
  resetLottery(guildId);
  addBalance(guildId, winnerId, prize);
  return { winnerId, prize, total };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lotteria')
    .setDescription('Lotteria del server: compra biglietti e vinci il piatto!')
    .addSubcommand((s) => s.setName('info').setDescription('Mostra piatto, prezzo e biglietti venduti'))
    .addSubcommand((s) =>
      s.setName('compra').setDescription('Compra biglietti della lotteria')
        .addIntegerOption((o) => o.setName('biglietti').setDescription(`Quanti biglietti (1-${MAX_TICKETTI_PER_VOLTA})`).setRequired(false).setMinValue(1).setMaxValue(MAX_TICKETTI_PER_VOLTA))
    )
    .addSubcommand((s) => s.setName('estrai').setDescription('Estrai subito il vincitore (staff)')),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (sub === 'info') {
      const state = getState(guildId);
      const total = Object.values(state.entries).reduce((a, b) => a + b, 0);
      const mine = state.entries[userId] || 0;
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🎰 Lotteria del server')
        .addFields(
          { name: '🍯 Piatto', value: `**${state.pot}** 🪙`, inline: true },
          { name: '🎟️ Prezzo biglietto', value: `**${state.ticketPrice}** 🪙`, inline: true },
          { name: '📊 Biglietti venduti', value: `**${total}/${state.threshold}**`, inline: true },
          { name: '🎫 I tuoi biglietti', value: `**${mine}**`, inline: true }
        )
        .setDescription(
          total >= state.threshold
            ? '🔥 Soglia raggiunta: estrazione imminente!'
            : `L'estrazione automatica parte a **${state.threshold}** biglietti. Usa \`/lotteria compra\`!`
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'compra') {
      const n = interaction.options.getInteger('biglietti') ?? 1;
      if (!Number.isInteger(n) || n < 1 || n > MAX_TICKETTI_PER_VOLTA) {
        return interaction.reply({ content: `❌ Puoi comprare da 1 a ${MAX_TICKETTI_PER_VOLTA} biglietti alla volta.`, flags: MessageFlags.Ephemeral });
      }

      const before = getState(guildId);
      const cost = n * before.ticketPrice;
      const user = getUser(guildId, userId);
      if (!Number.isFinite(user.balance) || user.balance < cost) {
        return interaction.reply({
          content: `❌ Saldo insufficiente: **${n}** biglietti costano **${cost}** 🪙 (hai **${Number.isFinite(user.balance) ? user.balance : 0}** 🪙).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      addBalance(guildId, userId, -cost);
      const state = addTickets(guildId, userId, n);
      const total = Object.values(state.entries).reduce((a, b) => a + b, 0);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎟️ Biglietti acquistati!')
            .setDescription(`${interaction.user} ha comprato **${n}** biglietti per **${cost}** 🪙\n🍯 Piatto: **${state.pot}** 🪙 • 📊 Biglietti: **${total}/${state.threshold}**`)
            .setTimestamp(),
        ],
      });

      // Estrazione AUTOMATICA al raggiungimento della soglia.
      if (total >= state.threshold && !drawing.has(guildId)) {
        drawing.add(guildId);
        try {
          const result = await runDraw(guildId);
          if (result) await interaction.followUp({ embeds: [partyEmbed(result.winnerId, result.prize, result.total)] });
        } finally {
          drawing.delete(guildId);
        }
      }
      return;
    }

    // sub === 'estrai' (staff: controllo interno per lasciare info/compra a tutti).
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve il permesso **Gestisci server** per estrarre il vincitore.', flags: MessageFlags.Ephemeral });
    }
    if (drawing.has(guildId)) {
      return interaction.reply({ content: '⏳ Estrazione già in corso, attendi qualche secondo.', flags: MessageFlags.Ephemeral });
    }
    const total = totalTickets(guildId);
    if (total < MIN_TICKETTI_ESTRAZIONE_MANUALE) {
      // Rifiuto SENZA rimborsare: i biglietti restano validi per la prossima estrazione.
      return interaction.reply({
        content: `❌ Servono almeno **${MIN_TICKETTI_ESTRAZIONE_MANUALE}** biglietti per estrarre (ora: **${total}**). Nessun rimborso: i biglietti già comprati restano validi.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    drawing.add(guildId);
    try {
      const result = await runDraw(guildId);
      if (!result) {
        return interaction.reply({ content: '❌ Piatto vuoto: impossibile estrarre.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [partyEmbed(result.winnerId, result.prize, result.total)] });
    } finally {
      drawing.delete(guildId);
    }
  },
};
