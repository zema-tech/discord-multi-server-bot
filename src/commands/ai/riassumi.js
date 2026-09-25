const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI } = require('../../ai/ai');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS || { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
const themeInfo =
  typeof theme?.info === 'function'
    ? theme.info
    : (t, d, c) =>
        new EmbedBuilder()
          .setColor(c ?? 0x5865f2)
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

const SYSTEM_PROMPT =
  'Sei un assistente utile del server Discord. Riassumi la conversazione in italiano con un elenco puntato, conciso (max 1500 caratteri). Ignora spam e messaggi vuoti.';
const MAX_CONVERSATION_CHARS = 4000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('riassumi')
    .setDescription('Riassume gli ultimi messaggi del canale con l\u2019AI')
    .addIntegerOption((option) =>
      option
        .setName('quantita')
        .setDescription('Numero di messaggi da riassumere (5-50)')
        .setMinValue(5)
        .setMaxValue(50)
    ),
  cooldown: 30,
  async execute(interaction) {
    const _q = interaction.options.getInteger('quantita');
    const quantita = Number.isFinite(_q) ? Math.min(50, Math.max(5, _q)) : 20;

    try {
      await interaction.deferReply();
    } catch {
      // defer fallito (es. già replied): si prosegue, safeEdit usa followUp
    }

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

    if (!interaction.channel?.messages?.fetch) {
      await safeEdit({ embeds: [themeErr('Impossibile leggere i messaggi di questo canale.')] });
      return;
    }

    let messages;
    try {
      messages = await interaction.channel.messages.fetch({ limit: quantita });
    } catch {
      await safeEdit({ embeds: [themeErr('Impossibile leggere i messaggi del canale.')] });
      return;
    }

    const partecipanti = new Set();
    const righe = [...(messages?.values?.() || [])]
      .reverse()
      .map((m) => {
        const autore = m?.author ? m.author.username || 'Sconosciuto' : 'Sconosciuto';
        const contenuto = String(m?.content || '').trim();
        if (!contenuto) return '';
        if (m?.author?.id) partecipanti.add(m.author.id);
        else partecipanti.add(`nome:${autore}`);
        return `${autore}: ${contenuto}`;
      })
      .filter(Boolean);

    if (righe.length < 3) {
      const embed = themeInfo(
        'ℹ️ Niente da riassumere',
        'Servono almeno 3 messaggi di testo nel canale.',
        COLORS.primary
      );
      themeFooter(embed, interaction);
      await safeEdit({ embeds: [embed] });
      return;
    }

    const nomi = [...(messages?.values?.() || [])]
      .map((m) => (m?.author ? m.author.username : null))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 20)
      .join(', ');
    const conversazione = righe.join('\n').slice(0, MAX_CONVERSATION_CHARS);
    const prompt =
      `Riassumi questa conversazione del canale.\n` +
      `Partecipanti (${partecipanti.size}): ${nomi || 'sconosciuti'}\n` +
      `Messaggi di testo: ${righe.length}\n${conversazione}`;

    let riassunto;
    try {
      riassunto = await askAI(prompt, SYSTEM_PROMPT);
    } catch (err) {
      await safeEdit({ embeds: [themeErr(err?.message || 'AI non disponibile, riprova più tardi.')] });
      return;
    }

    const testo = String(riassunto ?? '').trim();
    if (!testo) {
      await safeEdit({ embeds: [themeErr('AI ha restituito una risposta vuota, riprova più tardi.')] });
      return;
    }

    const embed = themeInfo(
      `📝 Riassunto ultimi ${righe.length} messaggi`,
      themeTruncate(testo, 4000),
      COLORS.primary
    );
    try {
      embed.addFields({
        name: '👥 Partecipanti',
        value: themeTruncate(`${partecipanti.size}${nomi ? ` — ${nomi}` : ''}`, 1024) || 'n/d',
        inline: false,
      });
    } catch {
      // campi non critici
    }
    themeFooter(embed, interaction);

    await safeEdit({ embeds: [embed] }).catch(() => null);
  },
};
