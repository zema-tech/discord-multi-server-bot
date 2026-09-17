const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { setReward, removeReward, listRewards } = require('../../database/levelRewards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premi')
    .setDescription('Gestisci i ruoli premio per i livelli')
    .addSubcommand((s) =>
      s.setName('imposta').setDescription('Assegna un ruolo a un livello')
        .addIntegerOption((o) => o.setName('livello').setDescription('Livello (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da assegnare').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('rimuovi').setDescription('Rimuovi il premio di un livello')
        .addIntegerOption((o) => o.setName('livello').setDescription('Livello (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    )
    .addSubcommand((s) =>
      s.setName('lista').setDescription('Mostra tutti i premi livello')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'lista') {
      const list = listRewards(guildId);
      if (!list.length) {
        return interaction.reply({ content: '📭 Nessun premio livello configurato. Usa `/premi imposta`.', flags: MessageFlags.Ephemeral });
      }
      // Micro-fix: con tanti premi la description supererebbe il limite 4096 char.
      const ordinati = [...list].sort((a, b) => a.level - b.level);
      const MAX = 25;
      const righe = ordinati.slice(0, MAX).map((r) => `⭐ Livello **${r.level}** → <@&${r.roleId}>`);
      if (ordinati.length > MAX) righe.push(`…e altri **${ordinati.length - MAX}** premi.`);
      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🏆 Premi livello')
        .setThumbnail(interaction.guild.iconURL() || interaction.user.displayAvatarURL())
        .setDescription(righe.join('\n').slice(0, 4096))
        .setFooter({ text: `Richiesto da ${interaction.user.tag}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    const livello = interaction.options.getInteger('livello');
    if (!Number.isInteger(livello) || livello < 1 || livello > 100) {
      return interaction.reply({ content: '❌ Livello non valido: usa un numero tra 1 e 100.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'rimuovi') {
      const existed = removeReward(guildId, livello);
      return interaction.reply({
        content: existed ? `✅ Premio per il livello **${livello}** rimosso.` : `ℹ️ Nessun premio configurato per il livello **${livello}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // sub === 'imposta'
    const ruolo = interaction.options.getRole('ruolo');
    if (!ruolo.editable) {
      return interaction.reply({
        content: '❌ Non posso gestire quel ruolo: è sopra il mio ruolo più alto o è un ruolo gestito. Sposta il mio ruolo più in alto nella gerarchia.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (ruolo.managed) {
      return interaction.reply({ content: '❌ Quel ruolo è gestito da un\'integrazione e non può essere assegnato.', flags: MessageFlags.Ephemeral });
    }
    setReward(guildId, livello, ruolo.id);
    return interaction.reply({
      content: `✅ Dal livello **${livello}** gli utenti riceveranno ${ruolo}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
