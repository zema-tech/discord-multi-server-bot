const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSfida, getProgress, isCompletata, getMiniLeaderboard, OBIETTIVO, PREMIO } = require('../../database/sfide');

module.exports = {
  data: new SlashCommandBuilder().setName('sfida').setDescription('Mostra la sfida settimanale del server'),
  cooldown: 5,
  async execute(interaction) {
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
        const name = user ? user.tag : 'Utente ' + e.id;
        const flag = e.count >= OBIETTIVO ? ' ✅' : '';
        return '**' + (i + 1) + '.** ' + name + ' — **' + e.count + '/' + OBIETTIVO + '**' + flag;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🏆 Sfida settimanale')
      .setDescription(
        `Tipo: **${sfida.current.tipo}**\nObiettivo: **${OBIETTIVO} messaggi**\nPremio: **${PREMIO}** 🪙\nScade: <t:${scade}:R>\n\n` +
          `I tuoi progressi: **${miei}/${OBIETTIVO}** ${done ? '✅ completata!' : ''}`
      )
      .addFields({ name: '📊 Mini classifica', value: lines.length ? lines.join('\n').slice(0, 1024) : 'Nessun partecipante ancora. Scrivi in chat per iniziare!' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
