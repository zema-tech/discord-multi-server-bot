const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLevel, xpForLevel, totalXp, getRankPosition } = require('../../database/levels');

// theme.js con fallback inline: mai crash se il require fallisce.
let _T = null;
try { _T = require('../../utils/theme'); } catch { _T = null; }
const COLORS = _T?.COLORS ?? { purple: 0x9b59b6 };
const applyFooter = _T?.applyFooter ?? ((embed, interaction) => {
  try { embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { embed.setTimestamp(); } catch { /* ignora */ }
  return embed;
});
const bar = _T?.bar ?? ((cur, max, len = 10) => {
  const L = Number.isFinite(Number(len)) && Number(len) >= 1 ? Math.min(25, Math.floor(Number(len))) : 10;
  const c = Number(cur), m = Number(max);
  let r = 0;
  if (Number.isFinite(c) && Number.isFinite(m) && m > 0) r = Math.min(1, Math.max(0, c / m));
  const f = Math.round(r * L);
  return '█'.repeat(f) + '░'.repeat(L - f);
});
const num = _T?.num ?? ((n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d'));
const truncate = _T?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Mostra il tuo livello (o quello di un altro utente)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    const gid = interaction.guild?.id;
    const d = getLevel(gid, user.id);
    // Sanitizza: record corrotti (livello negativo) mandavano in crash String.repeat
    const level = Number.isFinite(d.level) ? Math.max(0, Math.floor(d.level)) : 0;
    const need = Math.max(1, xpForLevel(level));
    const xp = Number.isFinite(d.xp) ? Math.min(Math.max(0, Math.floor(d.xp)), need) : 0;
    const msgCount = Number.isFinite(d.messageCount) ? Math.max(0, Math.floor(d.messageCount)) : 0;
    const voiceMin = Number.isFinite(d.voiceMinutes) ? Math.max(0, Math.floor(d.voiceMinutes)) : 0;
    const total = totalXp({ level, xp });
    const ratio = need > 0 ? xp / need : 0;
    const SIZE = 12;
    const progress = bar(xp, need, SIZE);
    const percent = Math.round((Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0) * 100);
    const pos = (() => {
      try {
        return gid ? getRankPosition(gid, user.id) : null;
      } catch { return null; }
    })();
    // Prossimo premio ruolo (se configurato).
    let nextReward = '';
    try {
      const { listRewards } = require('../../database/levelRewards');
      const up = (gid ? listRewards(gid) : []).filter((r) => r.level > level).sort((a, b) => a.level - b.level)[0];
      if (up) nextReward = `\n🎁 Prossimo premio: <@&${up.roleId}> al livello **${num(up.level)}**`;
    } catch {}
    const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅';
    const color = COLORS.purple ?? COLORS.primary ?? 0x9b59b6;
    const embed = applyFooter(new EmbedBuilder()
      .setColor(color)
      .setTitle(truncate(`⭐ Rank di ${user.username}`, 256))
      .setThumbnail(user.displayAvatarURL())
      .setDescription(
        truncate(`**Livello ${num(level)}** • **${num(percent)}%**${pos ? ` • ${medal} **#${num(pos)}**` : ''}\n\`${progress}\`\n✨ **${num(xp)}** / **${num(need)}** XP (totale **${num(total)}**)\n💬 Messaggi: **${num(msgCount)}** • 🎙️ Vocali: **${num(voiceMin)} min**${nextReward}`, 4000)
      ), interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
