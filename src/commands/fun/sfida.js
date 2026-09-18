const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getSfida, getProgress, isCompletata, getMiniLeaderboard, OBIETTIVO, PREMIO } = require('../../database/sfide');

// Tema premium condiviso, con fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { success: 0x57f287, error: 0xed4245 };
const themeBar = typeof T?.bar === 'function'
  ? T.bar
  : (cur, max, len = 10) => {
      const m = Number(max) > 0 ? Number(cur) / Number(max) : 0;
      const r = Math.min(1, Math.max(0, m || 0));
      const f = Math.round(r * len);
      return '█'.repeat(f) + '░'.repeat(len - f);
    };
const medal = typeof T?.medal === 'function' ? T.medal : (i) => `**${Number(i) + 1}.**`;
const num = typeof T?.num === 'function' ? T.num : (n) => String(n ?? 'n/d');
const trunc = typeof T?.truncate === 'function' ? T.truncate : (s, m) => String(s ?? '').slice(0, m);
const applyFooter = typeof T?.applyFooter === 'function' ? T.applyFooter : (e, i) => {
  try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); } catch { /* ignora */ }
  try { e.setTimestamp(); } catch { /* ignora */ }
  return e;
};

module.exports = {
  data: new SlashCommandBuilder().setName('sfida').setDescription('Mostra la sfida settimanale del server'),
  cooldown: 5,
  async execute(interaction) {
    // FIX: crash in DM (interaction.guild null → TypeError su .id).
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    const guildId = interaction.guild.id;
    const now = Date.now();
    // getSfida rigenera automaticamente ogni lunedì/ciclo 7gg (inizio < 7gg).
    const sfida = getSfida(guildId, now);
    const miei = getProgress(guildId, interaction.user.id, now);
    const done = isCompletata(guildId, interaction.user.id, now);
    const mini = getMiniLeaderboard(guildId, 5, now);

    const scade = Math.floor((sfida.current.inizio + 7 * 24 * 3600 * 1000) / 1000);
    const lines = await Promise.all(
      mini.map(async (e, i) => {
        const user = await interaction.client.users.fetch(e.id).catch(() => null);
        // FIX: slice per-riga (nome troncato, niente ID in chiaro, limite field 1024).
        const name = user ? trunc(user.tag, 32) : 'Utente sconosciuto';
        const flag = e.count >= OBIETTIVO ? ' ✅' : '';
        return `${medal(i)} ${name} — **${num(e.count)}/${num(OBIETTIVO)}**${flag}`;
      })
    );

    const barra = themeBar(miei, OBIETTIVO);
    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('🏆 Sfida settimanale')
      .setDescription(
        `Tipo: **${trunc(sfida.current.tipo, 80)}**\nObiettivo: **${num(OBIETTIVO)} messaggi**\nPremio: **${num(PREMIO)}** 🪙\nScade: <t:${scade}:R>\n\n` +
          `I tuoi progressi: **${num(miei)}/${num(OBIETTIVO)}** ${done ? '✅ completata!' : ''}\n\`${barra}\``
      )
      .addFields({ name: '📊 Mini classifica', value: lines.length ? lines.join('\n').slice(0, 1024) : 'Nessun partecipante ancora. Scrivi in chat per iniziare!' });
    applyFooter(embed, interaction);
    await interaction.reply({ embeds: [embed] });
  },
};
