const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getRep, getLastGiven, canGive, giveRep, getLeaderboard, COOLDOWN } = require('../../database/rep');

// theme.js con fallback inline se il require fallisse.
let COLORS = { gold: 0xffd700, warn: 0xfee75c, success: 0x57f287 };
let applyFooter = (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; };
let medal = (idx) => (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `**${Number(idx) + 1}.**`);
let num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
let truncate = (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); return str.length <= m ? str : str.slice(0, m); };
try {
  const t = require('../../utils/theme');
  COLORS = t.COLORS || COLORS;
  applyFooter = t.applyFooter || applyFooter;
  medal = t.medal || medal;
  num = t.num || num;
  truncate = t.truncate || truncate;
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Sistema di reputazione del server')
    .addSubcommand((s) =>
      s.setName('dai').setDescription('Dai +1 rep a un utente').addUserOption((o) => o.setName('utente').setDescription('Utente a cui dare la rep').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('mostra').setDescription('Mostra le rep di un utente').addUserOption((o) => o.setName('utente').setDescription('Utente (default: tu)').setRequired(false))
    )
    .addSubcommand((s) => s.setName('classifica').setDescription('Top 10 utenti con più rep')),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild?.id;
    if (!guildId) return safeReply(interaction, { content: '❌ Comando disponibile solo nei server.' });

    if (sub === 'dai') {
      const target = interaction.options.getUser('utente');
      const giverId = interaction.user.id;
      if (!target) {
        return safeReply(interaction, { content: '❌ Utente non valido.', flags: MessageFlags.Ephemeral });
      }
      if (target.id === giverId) {
        return safeReply(interaction, { content: '❌ Non puoi dare rep a te stesso!', flags: MessageFlags.Ephemeral });
      }
      if (target.bot) {
        return safeReply(interaction, { content: '❌ Non puoi dare rep a un bot!', flags: MessageFlags.Ephemeral });
      }
      const now = Date.now();
      if (!canGive(guildId, giverId, target.id, now)) {
        const next = Math.floor((getLastGiven(guildId, giverId, target.id) + COOLDOWN) / 1000);
        return safeReply(interaction, { content: `⏳ Potrai ridare rep a ${target.tag} <t:${next}:R>`, flags: MessageFlags.Ephemeral });
      }
      const updated = giveRep(guildId, giverId, target.id, now);
      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('⭐ Rep assegnata!')
        .setDescription(`⭐ ${interaction.user} ha dato +1 rep a ${target}! (Totale: **${num(updated.count)}**)`)
        .setTimestamp();
      applyFooter(embed, interaction);
      return safeReply(interaction, { embeds: [embed] });
    }

    if (sub === 'mostra') {
      const target = interaction.options.getUser('utente') || interaction.user;
      const rep = getRep(guildId, target.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.warn)
        .setTitle(truncate(`⭐ Reputazione di ${target.tag}`, 256))
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setDescription(`**${num(rep.count)}** rep ricevute`)
        .setTimestamp();
      applyFooter(embed, interaction);
      return safeReply(interaction, { embeds: [embed] });
    }

    // classifica
    const top = getLeaderboard(guildId, 10);
    if (!top.length) return safeReply(interaction, { content: '📭 Nessuna rep assegnata ancora. Usa `/rep dai`!' });
    const lines = await Promise.all(
      top.map(async (e, i) => {
        const user = await interaction.client.users.fetch(e.id).catch(() => null);
        const member = user ? await interaction.guild.members.fetch(e.id).catch(() => null) : null;
        const display = member ? member.displayName : user ? user.username : null;
        // Utenti usciti: mai crash, mai ID grezzi come nome principale.
        const name = display ? truncate(display, 32) : '*Utente uscito*';
        return `${medal(i)} ${name} — **${num(e.count)}** ⭐`;
      })
    );
    const embed = new EmbedBuilder()
      .setColor(COLORS.warn)
      .setTitle(truncate(`⭐ Classifica rep — ${interaction.guild.name}`, 256))
      .setDescription(truncate(lines.join('\n'), 4096))
      .setTimestamp();
    applyFooter(embed, interaction);
    await safeReply(interaction, { embeds: [embed] });
  },
};
