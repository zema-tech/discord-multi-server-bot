const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { askAI } = require('../../utils/ai');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS || { purple: 0x9b59b6, error: 0xed4245 };
const themeInfo =
  typeof theme?.info === 'function'
    ? theme.info
    : (t, d, c) =>
        new EmbedBuilder()
          .setColor(c ?? 0x9b59b6)
          .setTitle(String(t ?? '').slice(0, 256))
          .setDescription(String(d ?? '').slice(0, 4000))
          .setTimestamp();
const themeErr =
  typeof theme?.err === 'function'
    ? theme.err
    : (t) =>
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Errore')
          .setDescription(String(t ?? '').slice(0, 4000))
          .setTimestamp();
const themeFooter =
  typeof theme?.applyFooter === 'function'
    ? theme.applyFooter
    : (e, i) => {
        try {
          e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` });
        } catch {}
        try {
          e.setTimestamp();
        } catch {}
        return e;
      };
const themeTruncate =
  typeof theme?.truncate === 'function'
    ? theme.truncate
    : (s, max) => String(s ?? '').slice(0, max);
const themePaginate = typeof theme?.paginate === 'function' ? theme.paginate : null;

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
    const safeReply = async (payload) => {
      try {
        return await interaction.reply(payload);
      } catch {
        try {
          return await interaction.followUp(payload);
        } catch {
          return null;
        }
      }
    };
    const safeEdit = async (payload) => {
      try {
        return await interaction.editReply(payload);
      } catch {
        try {
          return await interaction.followUp(payload);
        } catch {
          return null;
        }
      }
    };

    const aiConfig = getAIConfig(interaction.guild?.id);
    if (!aiConfig.funAI) {
      await safeReply({ content: '❌ AI disabilitata per le funzioni divertenti in questo server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const tema = (interaction.options.getString('tema', true) || '').trim();
    if (!tema) {
      await safeReply({ content: '❌ Il tema non può essere vuoto.', flags: MessageFlags.Ephemeral });
      return;
    }
    const lunghezza = interaction.options.getString('lunghezza') || 'breve';
    const target = (LENGTHS[lunghezza] || LENGTHS.breve).target;
    const lunghezzaSafe = LENGTHS[lunghezza] ? lunghezza : 'breve';

    try {
      await interaction.deferReply();
    } catch {
      // si prosegue: safeEdit ripiega su followUp
    }

    let racconto;
    try {
      racconto = await askAI(
        `Scrivi un racconto originale in italiano sul tema: "${tema}". Lunghezza circa ${target} caratteri. Inizia con la riga "Titolo: <titolo del racconto>" seguita dal racconto.`,
        'Sei uno scrittore creativo. Scrivi in italiano, storie originali e coinvolgenti, senza contenuti offensivi.'
      );
    } catch {
      await safeEdit({ embeds: [themeErr('AI non disponibile, riprova più tardi.')] });
      return;
    }

    const grezzo = String(racconto ?? '').trim();
    if (!grezzo) {
      await safeEdit({ embeds: [themeErr('AI ha restituito una storia vuota, riprova più tardi.')] });
      return;
    }

    let titolo = `📖 ${tema.slice(0, 80)}`;
    let corpo = grezzo;
    const match = corpo.match(/^titolo:\s*(.+)$/im);
    if (match && match[1].trim()) {
      titolo = `📖 ${match[1].trim().slice(0, 200)}`;
      corpo = corpo.replace(match[0], '').trim() || corpo;
    }
    titolo = themeTruncate(titolo, 256) || '📖 Racconto';

    // Output lungo: pagina se supera il limite embed (4096 → slice 4000 per pagina).
    if (corpo.length > 4000 && themePaginate) {
      const chunks = [];
      let rest = corpo;
      while (rest.length > 0 && chunks.length < 10) {
        chunks.push(rest.slice(0, 4000));
        rest = rest.slice(4000);
      }
      const pages = chunks.map((c, idx) => {
        const e = themeInfo(
          idx === 0 ? titolo : `${titolo} (${idx + 1}/${chunks.length})`,
          c,
          COLORS.purple
        );
        themeFooter(e, interaction);
        try {
          e.setFooter({ text: themeTruncate(`Racconto ${lunghezzaSafe} • ${e.data?.footer?.text || ''}`, 2048) });
        } catch {}
        return e;
      });
      try {
        await themePaginate(interaction, pages);
      } catch {
        await safeEdit({ embeds: [pages[0]] });
      }
      return;
    }

    const embed = themeInfo(titolo, themeTruncate(corpo, 4000), COLORS.purple);
    themeFooter(embed, interaction);
    try {
      embed.setFooter({ text: themeTruncate(`Racconto ${lunghezzaSafe} • ${embed.data?.footer?.text || ''}`, 2048) });
    } catch {
      // footer non critico
    }

    await safeEdit({ embeds: [embed] }).catch(() => null);
  },
};
