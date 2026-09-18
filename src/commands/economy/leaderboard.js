const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../../database/economy');

// theme.js con fallback inline se il require fallisse.
let COLORS = { gold: 0xffd700, error: 0xed4245 };
let applyFooter = (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; };
let medal = (idx) => (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `**${Number(idx) + 1}.**`);
let num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
let truncate = (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); return str.length <= m ? str : str.slice(0, m); };
let err = null;
try {
  const t = require('../../utils/theme');
  COLORS = t.COLORS || COLORS;
  applyFooter = t.applyFooter || applyFooter;
  medal = t.medal || medal;
  num = t.num || num;
  truncate = t.truncate || truncate;
  err = t.err || err;
} catch { /* fallback inline sopra */ }

// Reply sicura: mai unhandled rejection (altri 15 agenti toccano altri file: qui solo catch).
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Classifica dei più ricchi del server'),
  cooldown: 5,
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild?.id) return safeReply(interaction, { content: '❌ Comando disponibile solo nei server.' });
    const top = getLeaderboard(guild.id, 10);
    if (!top.length) {
      const e = err ? err('Nessun dato economico ancora. Usa `/daily` o `/work`!') : null;
      return safeReply(interaction, e ? { embeds: [e] } : { content: '📭 Nessun dato economico ancora. Usa `/daily` o `/work`!' });
    }
    const lines = await Promise.all(
      top.map(async (e, i) => {
        const user = await interaction.client.users.fetch(e.id).catch(() => null);
        const member = user ? await guild.members.fetch(e.id).catch(() => null) : null;
        const display = member ? member.displayName : user ? user.username : null;
        // Utenti usciti: mai crash, mai ID esposti come nome principale.
        const name = display ? `**${truncate(display, 32)}**` : '*Utente uscito*';
        return `${medal(i)} ${name} — **${num(e.balance)}** 🪙`;
      })
    );
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(truncate(`🏆 Classifica più ricchi — ${guild.name}`, 256))
      .setThumbnail(guild.iconURL() || interaction.user.displayAvatarURL())
      .setDescription(truncate(lines.join('\n'), 4096));
    applyFooter(embed, interaction);
    await safeReply(interaction, { embeds: [embed] });
  },
};
