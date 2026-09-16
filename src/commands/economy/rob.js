const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUser, addBalance } = require('../../database/economy');

const COOLDOWN = 6 * 3600 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Tenta di rubare monete (solo portafoglio) a un utente')
    .addUserOption((o) => o.setName('utente').setDescription('Vittima').setRequired(true)),
  cooldown: 10,
  async execute(interaction) {
    const target = interaction.options.getUser('utente');
    if (target.bot || target.id === interaction.user.id)
      return interaction.reply({ content: '❌ Bersaglio non valido.', flags: MessageFlags.Ephemeral });

    const gid = interaction.guild.id;
    const thief = getUser(gid, interaction.user.id);
    if (Date.now() - (Number(thief.lastRob) || 0) < COOLDOWN)
      return interaction.reply({ content: `⏳ Potrai rubare di nuovo <t:${Math.floor(((Number(thief.lastRob) || 0) + COOLDOWN) / 1000)}:R>`, flags: MessageFlags.Ephemeral });

    const victim = getUser(gid, target.id);
    if (!Number.isFinite(victim.balance) || (victim.balance || 0) < 100)
      return interaction.reply({ content: '❌ La vittima è troppo povera (min 100 🪙 nel portafoglio).', flags: MessageFlags.Ephemeral });

    require('../../database/economy').updateUser(gid, interaction.user.id, { lastRob: Date.now() });
    const success = Math.random() < 0.45;
    if (!success) {
      // Multa mai negativa/NaN: con saldo corrotto vale 0, mai un accredito
      const fine = Math.max(0, Math.min(150, Number.isFinite(thief.balance) ? thief.balance : 0));
      addBalance(gid, interaction.user.id, -fine);
      return interaction.reply(`🚨 Colto in flagrante! Hai pagato **${fine}** 🪙 di multa.`);
    }
    const stolen = Math.min(Math.floor(victim.balance * (0.1 + Math.random() * 0.2)), victim.balance);
    addBalance(gid, target.id, -stolen);
    addBalance(gid, interaction.user.id, stolen);
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('🥷 Furto riuscito!').setDescription(`Hai rubato **${stolen}** 🪙 a ${target}!`).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
