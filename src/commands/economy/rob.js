const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance, updateUser } = require('../../database/economy');

// theme.js con fallback inline se il require fallisse.
let COLORS = { gold: 0xffd700, error: 0xed4245 };
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

const COOLDOWN = 6 * 3600 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Tenta di rubare monete (solo portafoglio) a un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Vittima').setRequired(true)),
  cooldown: 10,
  async execute(interaction) {
    const gid = interaction.guild?.id;
    if (!gid) return safeReply(interaction, { content: '❌ Comando disponibile solo nei server.' });
    const target = interaction.options.getUser('utente');
    if (!target || target.bot || target.id === interaction.user.id)
      return safeReply(interaction, { content: '❌ Bersaglio non valido.', flags: MessageFlags.Ephemeral });

    const thief = getUser(gid, interaction.user.id);
    if (Date.now() - (Number(thief.lastRob) || 0) < COOLDOWN)
      return safeReply(interaction, { content: `⏳ Potrai rubare di nuovo <t:${Math.floor(((Number(thief.lastRob) || 0) + COOLDOWN) / 1000)}:R> (<t:${Math.floor(((Number(thief.lastRob) || 0) + COOLDOWN) / 1000)}:T>)`, flags: MessageFlags.Ephemeral });

    const victim = getUser(gid, target.id);
    const victimBalance = Number.isFinite(victim.balance) ? victim.balance : 0;
    if (!Number.isFinite(victim.balance) || (victim.balance || 0) < 100)
      return safeReply(interaction, { content: '❌ La vittima è troppo povera (min 100 🪙 nel portafoglio).', flags: MessageFlags.Ephemeral });

    updateUser(gid, interaction.user.id, { lastRob: Date.now() });
    const baseEmbed = (color, title) => applyFooter(new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp(), interaction);

    const success = Math.random() < 0.45;
    if (!success) {
      // Multa mai negativa/NaN: con saldo corrotto vale 0, mai un accredito
      const fine = Math.max(0, Math.min(150, Number.isFinite(thief.balance) ? thief.balance : 0));
      addBalance(gid, interaction.user.id, -fine);
      const embed = baseEmbed(COLORS.error, '🚨 Furto fallito!')
        .setDescription(`Colto in flagrante mentre cercavi di derubare ${target}!\n💸 Multa pagata: **${num(fine)}** 🪙\n🛡️ La banca resta al sicuro dai furti: usa \`/bank deposita\`!`);
      return safeReply(interaction, { embeds: [embed] });
    }
    const stolen = Math.min(Math.floor(victimBalance * (0.1 + Math.random() * 0.2)), victimBalance);
    addBalance(gid, target.id, -stolen);
    addBalance(gid, interaction.user.id, stolen);
    const embed = baseEmbed(COLORS.gold, '🥷 Furto riuscito!').setDescription(
      `${interaction.user} 🆚 ${target}\n💰 Bottino: **${num(stolen)}** 🪙 rubati dal portafoglio!\n🛡️ Ricorda: i soldi in banca non si possono rubare.`
    );
    await safeReply(interaction, { embeds: [embed] });
  },
};
