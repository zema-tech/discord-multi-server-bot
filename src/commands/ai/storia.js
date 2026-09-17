const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { askAI } = require('../../utils/ai');

const LENGTHS = {
  breve: { label: 'breve', target: 800 },
  media: { label: 'media', target: 1500 },
};

function getAIConfig(guildId) {
  const defaults = { ticketAI: true, funAI: true };
  try {
    const mod = require('../../database/aiConfig');
    const cfg =
      mod && typeof mod.getAIConfig === 'function'
        ? mod.getAIConfig(guildId)
        : mod && typeof mod.getConfig === 'function'
          ? mod.getConfig(guildId)
          : mod;
    if (cfg && typeof cfg === 'object') return { ...defaults, ...cfg };
  } catch {}
  return { ...defaults };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('storia')
    .setDescription('Genera un racconto originale con l\u2019AI')
    .addStringOption((option) =>
      option.setName('tema').setDescription('Il tema del racconto').setRequired(true).setMaxLength(200)
    )
    .addStringOption((option) =>
      option
        .setName('lunghezza')
        .setDescription('Lunghezza del racconto (default: breve)')
        .addChoices({ name: 'breve', value: 'breve' }, { name: 'media', value: 'media' })
    ),
  cooldown: 20,
  async execute(interaction) {
    const aiConfig = getAIConfig(interaction.guild?.id);
    if (!aiConfig.funAI) {
      return interaction.reply({ content: '❌ AI disabilitata per le funzioni divertenti in questo server.', flags: MessageFlags.Ephemeral });
    }

    const tema = interaction.options.getString('tema', true).trim();
    if (!tema) {
      return interaction.reply({ content: '❌ Il tema non può essere vuoto.', flags: MessageFlags.Ephemeral });
    }
    const lunghezza = interaction.options.getString('lunghezza') || 'breve';
    const target = (LENGTHS[lunghezza] || LENGTHS.breve).target;

    await interaction.deferReply();

    let racconto;
    try {
      racconto = await askAI(
        `Scrivi un racconto originale in italiano sul tema: "${tema}". Lunghezza circa ${target} caratteri. Inizia con la riga "Titolo: <titolo del racconto>" seguita dal racconto.`,
        'Sei uno scrittore creativo. Scrivi in italiano, storie originali e coinvolgenti, senza contenuti offensivi.'
      );
    } catch {
      await interaction.editReply('⚠️ AI non disponibile, riprova più tardi.');
      return;
    }

    let titolo = `📖 ${tema.slice(0, 80)}`;
    let corpo = racconto.trim();
    const match = corpo.match(/^titolo:\s*(.+)$/im);
    if (match && match[1].trim()) {
      titolo = `📖 ${match[1].trim().slice(0, 200)}`;
      corpo = corpo.replace(match[0], '').trim();
    }

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(titolo.slice(0, 256))
      .setDescription(corpo.slice(0, 4096))
      .setFooter({ text: `Racconto ${LENGTHS[lunghezza] ? lunghezza : 'breve'} • Richiesto da ${interaction.user.username} • Storia generata dall\u2019AI` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
