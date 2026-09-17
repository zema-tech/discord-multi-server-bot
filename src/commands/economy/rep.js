const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getRep, canGive, giveRep, getLeaderboard, COOLDOWN } = require('../../database/rep');

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
    const guildId = interaction.guild.id;

    if (sub === 'dai') {
      const target = interaction.options.getUser('utente');
      const giverId = interaction.user.id;
      if (target.id === giverId) {
        return interaction.reply({ content: '❌ Non puoi dare rep a te stesso!', flags: MessageFlags.Ephemeral });
      }
      if (target.bot) {
        return interaction.reply({ content: '❌ Non puoi dare rep a un bot!', flags: MessageFlags.Ephemeral });
      }
      const now = Date.now();
      if (!canGive(guildId, giverId, target.id, now)) {
        const { getLastGiven } = require('../../database/rep');
        const next = Math.floor((getLastGiven(guildId, giverId, target.id) + COOLDOWN) / 1000);
        return interaction.reply({ content: `⏳ Potrai ridare rep a ${target.tag} <t:${next}:R>`, flags: MessageFlags.Ephemeral });
      }
      const updated = giveRep(guildId, giverId, target.id, now);
      return interaction.reply(`⭐ ${interaction.user} ha dato +1 rep a ${target}! (Totale: **${updated.count}**)`);
    }

    if (sub === 'mostra') {
      const target = interaction.options.getUser('utente') || interaction.user;
      const rep = getRep(guildId, target.id);
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`⭐ Reputazione di ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setDescription(`**${rep.count}** rep ricevute`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // classifica
    const top = getLeaderboard(guildId, 10);
    if (!top.length) return interaction.reply('📭 Nessuna rep assegnata ancora. Usa `/rep dai`!');
    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(
      top.map(async (e, i) => {
        const user = await interaction.client.users.fetch(e.id).catch(() => null);
        const name = user ? user.tag : 'Utente ' + e.id;
        const pos = medals[i] || '**' + (i + 1) + '.**';
        return pos + ' ' + name + ' — **' + e.count + '** ⭐';
      })
    );
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`⭐ Classifica rep — ${interaction.guild.name}`)
      .setDescription(lines.join('\n'))
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
