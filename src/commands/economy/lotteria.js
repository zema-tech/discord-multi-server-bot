const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');
const { getState, addTickets, totalTickets, resetLottery } = require('../../database/lotteria');

// theme.js con fallback inline se il require fallisse.
let COLORS = { gold: 0xffd700, success: 0x57f287, purple: 0x9b59b6 };
let applyFooter = (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; };
let num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
try {
  const t = require('../../utils/theme');
  COLORS = t.COLORS || COLORS;
  applyFooter = t.applyFooter || applyFooter;
  num = t.num || num;
} catch { /* fallback inline sopra */ }

// Reply sicura: mai unhandled rejection.
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

const MAX_TICKETTI_PER_VOLTA = 5;
const MIN_TICKETTI_ESTRAZIONE_MANUALE = 3;

// Anti-race: una sola estrazione alla volta per guild.
const drawing = new Set();

// Vincitore random pesato sul numero di biglietti (cumulativo: niente bag esploso in memoria).
function pickWinnerWeighted(entries) {
  let total = 0;
  for (const c of Object.values(entries)) {
    const n = Math.floor(Number(c));
    if (Number.isInteger(n) && n > 0) total += n;
  }
  if (total <= 0) return null;
  let r = Math.floor(Math.random() * total);
  for (const [userId, count] of Object.entries(entries)) {
    r -= Math.floor(Number(count)) || 0;
    if (r < 0) return userId;
  }
  return null;
}

function partyEmbed(winnerId, prize, total, interaction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('🎉 ABBIAMO UN VINCITORE! 🎉')
    .setDescription(`🥳 Congratulazioni <@${winnerId}>!\n\nHai vinto **${num(prize)}** 🪙 con **${num(total)}** biglietti totali in gioco!`)
    .setTimestamp();
  if (interaction) applyFooter(embed, interaction);
  return embed;
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
    const guildId = interaction.guild?.id;
    if (!guildId) return safeReply(interaction, { content: '❌ Comando disponibile solo nei server.' });
    const userId = interaction.user.id;

    if (sub === 'info') {
      const state = getState(guildId);
      const total = Object.values(state.entries).reduce((a, b) => a + (Number(b) || 0), 0);
      const mine = state.entries[userId] || 0;
      const embed = new EmbedBuilder()
        .setColor(COLORS.purple)
        .setTitle('🎰 Lotteria del server')
        .addFields(
          { name: '🍯 Piatto', value: `**${num(state.pot)}** 🪙`, inline: true },
          { name: '🎟️ Prezzo biglietto', value: `**${num(state.ticketPrice)}** 🪙`, inline: true },
          { name: '📊 Biglietti venduti', value: `**${num(total)}/${num(state.threshold)}**`, inline: true },
          { name: '🎫 I tuoi biglietti', value: `**${num(mine)}**`, inline: true }
        )
        .setDescription(
          total >= state.threshold
            ? '🔥 Soglia raggiunta: estrazione imminente!'
            : `L'estrazione automatica parte a **${num(state.threshold)}** biglietti. Usa \`/lotteria compra\`!`
        )
        .setTimestamp();
      applyFooter(embed, interaction);
      return safeReply(interaction, { embeds: [embed] });
    }

    if (sub === 'compra') {
      const n = interaction.options.getInteger('biglietti') ?? 1;
      if (!Number.isInteger(n) || n < 1 || n > MAX_TICKETTI_PER_VOLTA) {
        return safeReply(interaction, { content: `❌ Puoi comprare da 1 a ${MAX_TICKETTI_PER_VOLTA} biglietti alla volta.`, flags: MessageFlags.Ephemeral });
      }

      const before = getState(guildId);
      const cost = n * before.ticketPrice;
      const user = getUser(guildId, userId);
      if (!Number.isFinite(user.balance) || user.balance < cost) {
        return safeReply(interaction, {
          content: `❌ Saldo insufficiente: **${n}** biglietti costano **${num(cost)}** 🪙 (hai **${num(user.balance)}** 🪙).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      addBalance(guildId, userId, -cost);
      let state;
      try {
        state = addTickets(guildId, userId, n);
      } catch (e) {
        // Compensazione: se i biglietti non vengono registrati, rimborsa l'addebito.
        addBalance(guildId, userId, cost);
        return safeReply(interaction, { content: `❌ Acquisto fallito (${e?.message || 'errore'}). Saldo rimborsato.`, flags: MessageFlags.Ephemeral });
      }
      const total = Object.values(state.entries).reduce((a, b) => a + (Number(b) || 0), 0);

      await safeReply(interaction, {
        embeds: [
          (() => {
            const e = new EmbedBuilder()
              .setColor(COLORS.success)
              .setTitle('🎟️ Biglietti acquistati!')
              .setDescription(`${interaction.user} ha comprato **${num(n)}** biglietti per **${num(cost)}** 🪙\n🍯 Piatto: **${num(state.pot)}** 🪙 • 📊 Biglietti: **${num(total)}/${num(state.threshold)}**`)
              .setTimestamp();
            return applyFooter(e, interaction);
          })(),
        ],
      });

      // Estrazione AUTOMATICA al raggiungimento della soglia.
      if (total >= state.threshold && !drawing.has(guildId)) {
        drawing.add(guildId);
        try {
          const result = await runDraw(guildId);
          if (result) await safeReply(interaction, { embeds: [partyEmbed(result.winnerId, result.prize, result.total, interaction)] });
        } finally {
          drawing.delete(guildId);
        }
      }
      return;
    }

    // sub === 'estrai' (staff: controllo interno per lasciare info/compra a tutti).
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return safeReply(interaction, { content: '❌ Ti serve il permesso **Gestisci server** per estrarre il vincitore.', flags: MessageFlags.Ephemeral });
    }
    if (drawing.has(guildId)) {
      return safeReply(interaction, { content: '⏳ Estrazione già in corso, attendi qualche secondo.', flags: MessageFlags.Ephemeral });
    }
    const total = totalTickets(guildId);
    if (total < MIN_TICKETTI_ESTRAZIONE_MANUALE) {
      // Rifiuto SENZA rimborsare: i biglietti restano validi per la prossima estrazione.
      return safeReply(interaction, {
        content: `❌ Servono almeno **${MIN_TICKETTI_ESTRAZIONE_MANUALE}** biglietti per estrarre (ora: **${num(total)}**). Nessun rimborso: i biglietti già comprati restano validi.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    drawing.add(guildId);
    try {
      const result = await runDraw(guildId);
      if (!result) {
        return safeReply(interaction, { content: '❌ Piatto vuoto: impossibile estrarre.', flags: MessageFlags.Ephemeral });
      }
      return safeReply(interaction, { embeds: [partyEmbed(result.winnerId, result.prize, result.total, interaction)] });
    } finally {
      drawing.delete(guildId);
    }
  },
};
