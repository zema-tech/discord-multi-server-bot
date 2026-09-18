const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { askAI } = require('../../utils/ai');
const { getTicket, getConfig } = require('../../database/tickets');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c };
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

const MAX_HISTORY = 15;
const MAX_DRAFT_CHARS = 1200;
const MAX_HISTORY_CHARS_PER_MSG = 500;
const MAX_HISTORY_TOTAL_CHARS = 6000;
const COLLECTOR_MS = 60000;

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

function isStaff(member, ticketConfig) {
  if (!member) return false;
  try {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  } catch {
    return false;
  }
  try {
    return (ticketConfig.supportRoleIds || []).some((id) => member.roles?.cache?.has(id));
  } catch {
    return false;
  }
}

function formatHistory(messages) {
  const text = [...messages.values()]
    .reverse()
    .map((m) => {
      const autore = m.author ? m.author.username : 'Sconosciuto';
      const contenuto = truncate(String(m.content || '').trim(), MAX_HISTORY_CHARS_PER_MSG);
      return contenuto ? `${autore}: ${contenuto}` : '';
    })
    .filter(Boolean)
    .join('\n');
  return truncate(text, MAX_HISTORY_TOTAL_CHARS).trim();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-ai')
    .setDescription('Assistente AI per i ticket (bozze e riassunti)')
    .addSubcommand((s) => s.setName('suggerisci').setDescription('Genera una bozza di risposta staff per questo ticket'))
    .addSubcommand((s) => s.setName('riassumi').setDescription('Riassume questo ticket in 5 punti')),
  cooldown: 10,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }

    const aiConfig = getAIConfig(interaction.guild.id);
    if (!aiConfig.ticketAI) {
      return interaction.reply({ embeds: [themeErr('AI disabilitata per i ticket in questo server.')], flags: MessageFlags.Ephemeral });
    }

    const ticket = getTicket(interaction.guild.id, interaction.channelId);
    if (!ticket) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un canale ticket.')], flags: MessageFlags.Ephemeral });
    }
    if (ticket.status !== 'open') {
      return interaction.reply({ embeds: [themeErr('Il ticket è chiuso.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
    if (!interaction.deferred && !interaction.replied) {
      return;
    }

    let messages;
    try {
      messages = await interaction.channel.messages.fetch({ limit: MAX_HISTORY });
    } catch {
      return interaction.editReply({ embeds: [themeErr('Impossibile leggere i messaggi del ticket.')] }).catch(() => {});
    }

    const conversazione = formatHistory(messages);
    if (!conversazione) {
      return interaction.editReply({ embeds: [themeErr('Nessun messaggio di testo da analizzare nel ticket.')] }).catch(() => {});
    }

    if (sub === 'riassumi') {
      let riassunto;
      try {
        riassunto = await askAI(
          `Riassumi questo ticket di assistenza in esattamente 5 punti brevi:\n${conversazione}`,
          'Sei un assistente del team di supporto. Rispondi in italiano con esattamente 5 punti elenco brevi e chiari, tono professionale.'
        );
      } catch {
        return interaction.editReply({ embeds: [themeErr('AI non disponibile, riprova più tardi.')] }).catch(() => {});
      }
      riassunto = String(riassunto ?? '').trim();
      if (!riassunto) {
        return interaction.editReply({ embeds: [themeErr('AI non disponibile, riprova più tardi.')] }).catch(() => {});
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(truncate(`🎫 Riassunto ticket #${ticket.number}`, 256))
        .setDescription(truncate(riassunto, 4096))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] }).catch(() => {});
    }

    // ---- suggerisci ----
    let bozza;
    try {
      bozza = await askAI(
        `Scrivi una bozza di risposta dello staff per questo ticket di assistenza:\n${conversazione}`,
        `Sei un membro dello staff di supporto Discord. Scrivi in italiano una bozza di risposta professionale, cortese e risolutiva, max ${MAX_DRAFT_CHARS} caratteri. Solo il testo della risposta, senza intestazioni.`
      );
    } catch {
      return interaction.editReply({ embeds: [themeErr('AI non disponibile, riprova più tardi.')] }).catch(() => {});
    }
    bozza = String(bozza ?? '').slice(0, MAX_DRAFT_CHARS).trim();
    if (!bozza) {
      return interaction.editReply({ embeds: [themeErr('AI non disponibile, riprova più tardi.')] }).catch(() => {});
    }

    const publishBtn = new ButtonBuilder()
      .setCustomId('ticketai_publish')
      .setLabel('Pubblica')
      .setEmoji('📩')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(publishBtn);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(truncate(`✨ Bozza AI — ticket #${ticket.number}`, 256))
      .setDescription(bozza)
      .setFooter({ text: 'Solo lo staff può pubblicarla • Scade tra 60s' })
      .setTimestamp();

    const reply = await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => null);
    if (!reply || typeof reply.createMessageComponentCollector !== 'function') {
      return;
    }

    const ticketConfig = getConfig(interaction.guild.id);
    let collector = null;
    try {
      collector = reply.createMessageComponentCollector({
        filter: (i) => i.customId === 'ticketai_publish',
        time: COLLECTOR_MS,
        max: 1,
      });
    } catch {
      return;
    }
    if (!collector) return;

    collector.on('collect', async (i) => {
      if (!isStaff(i.member, ticketConfig)) {
        return i.reply({ embeds: [themeErr('Solo lo staff può pubblicare la bozza.')], flags: MessageFlags.Ephemeral });
      }
      try {
        await interaction.channel.send(`📩 **Risposta dello staff** (bozza AI, pubblicata da ${i.user}):\n${bozza}`.slice(0, 2000));
      } catch {
        return i.reply({ embeds: [themeErr('Non riesco a scrivere nel canale.')], flags: MessageFlags.Ephemeral });
      }
      const disabled = new ActionRowBuilder().addComponents(publishBtn.setDisabled(true));
      await i.update({ content: '✅ Bozza pubblicata nel ticket.', embeds: [], components: [disabled] }).catch(() => {});
    });

    collector.on('end', async (collected) => {
      if (collected.size > 0) return;
      const disabled = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticketai_publish_expired')
          .setLabel('Pubblica')
          .setEmoji('📩')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true)
      );
      await interaction.editReply({ components: [disabled] }).catch(() => {});
    });
  },
};
