const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const MAX_PROMPT = 200;

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
    .setName('immagina')
    .setDescription('Genera un\u2019immagine con l\u2019AI dal tuo prompt')
    .addStringOption((option) =>
      option.setName('prompt').setDescription('Descrivi l\u2019immagine da generare (max 200 caratteri)').setRequired(true).setMaxLength(MAX_PROMPT)
    ),
  cooldown: 20,
  async execute(interaction) {
    const aiConfig = getAIConfig(interaction.guild?.id);
    if (!aiConfig.funAI) {
      return interaction.reply({ content: '❌ AI disabilitata per le funzioni divertenti in questo server.', flags: MessageFlags.Ephemeral });
    }

    const prompt = interaction.options.getString('prompt', true).trim();
    if (!prompt) {
      return interaction.reply({ content: '❌ Il prompt non può essere vuoto.', flags: MessageFlags.Ephemeral });
    }
    if (prompt.length > MAX_PROMPT) {
      return interaction.reply({ content: `❌ Prompt troppo lungo (max ${MAX_PROMPT} caratteri).`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎨 Immagine generata')
      .addFields({ name: '💭 Prompt', value: prompt.slice(0, 1024) })
      .setImage(url)
      .setFooter({ text: '⚠️ Immagine generata dall\u2019AI: può contenere errori o artefatti' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
