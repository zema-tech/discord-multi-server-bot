const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { askAI } = require('../../utils/ai');
const { getConfig } = require('../../database/aiConfig');

const DEFAULT_SYSTEM_PROMPT = 'Sei un assistente utile del server Discord, rispondi in italiano, conciso (max 1500 caratteri)';

function resolveSystemPrompt(guildId) {
  try {
    const cfg = getConfig(guildId);
    if (cfg && typeof cfg.systemPrompt === 'string' && cfg.systemPrompt.trim()) {
      return cfg.systemPrompt.trim().slice(0, 1000);
    }
  } catch {}
  return DEFAULT_SYSTEM_PROMPT;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chiedi')
    .setDescription('Fai una domanda all\u2019AI del server')
    .addStringOption((option) =>
      option.setName('domanda').setDescription('La domanda da fare all\u2019AI').setRequired(true)
    ),
  cooldown: 15,
  async execute(interaction) {
    const domanda = interaction.options.getString('domanda', true);

    // Solo spazi: askAI la rifiuterebbe con un generico errore, meglio un errore chiaro.
    if (!domanda.trim()) {
      return interaction.reply({ content: '❌ La domanda non può essere vuota.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    const systemPrompt = resolveSystemPrompt(interaction.guildId);

    let risposta;
    try {
      risposta = await askAI(domanda, systemPrompt);
    } catch (err) {
      await interaction.editReply(`⚠️ ${err?.message || 'AI non disponibile, riprova più tardi.'}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤖 Risposta AI')
      .addFields({ name: '❓ Domanda', value: domanda.slice(0, 1024) })
      .setDescription(risposta.slice(0, 4096))
      .setFooter({ text: `Richiesto da ${interaction.user.username} • powered by AI gratuita` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
