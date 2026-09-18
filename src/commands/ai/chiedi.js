const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { askAI } = require('../../utils/ai');
const { getConfig } = require('../../database/aiConfig');

// theme.js con fallback inline: il file deve caricarsi anche se il require fallisce.
let _theme = null;
try {
  _theme = require('../../utils/theme');
} catch {
  _theme = null;
}
const COLORS = (_theme && _theme.COLORS) || { primary: 0x5865f2 };
const applyFooter =
  (_theme && _theme.applyFooter) ||
  ((embed, interaction) => {
    try {
      embed.setFooter({ text: `Richiesto da ${interaction?.user?.username ?? 'Utente'}` });
    } catch {}
    try {
      embed.setTimestamp();
    } catch {}
    return embed;
  });
const truncate =
  (_theme && _theme.truncate) || ((s, max) => String(s ?? '').slice(0, max));

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
      return interaction.reply({ content: '❌ La domanda non può essere vuota.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    try {
      await interaction.deferReply();
    } catch {
      return interaction.editReply('⚠️ Impossibile avviare la risposta, riprova.').catch(() => null);
    }

    const systemPrompt = resolveSystemPrompt(interaction.guildId);

    let risposta;
    try {
      risposta = await askAI(domanda, systemPrompt);
    } catch (err) {
      await interaction.editReply(`⚠️ ${err?.message || 'AI non disponibile, riprova più tardi.'}`).catch(() => null);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🤖 Risposta AI')
      .addFields({ name: '❓ Domanda', value: truncate(domanda, 1024) || '—' })
      .setDescription(truncate(risposta, 4000) || 'Nessuna risposta disponibile.');
    applyFooter(embed, interaction);
    try {
      const base = embed.data?.footer?.text ?? `Richiesto da ${interaction?.user?.username ?? 'Utente'}`;
      embed.setFooter({ text: truncate(`${base} • powered by AI gratuita`, 2048) });
    } catch {}

    await interaction.editReply({ embeds: [embed] }).catch(() => null);
  },
};
