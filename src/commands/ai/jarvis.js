const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

const agents = require('../../agents');
const sessions = require('../../agents/sessions');
const approvals = require('../../agents/approvals');

let _theme = null;
try {
  _theme = require('../../utils/theme');
} catch {
  _theme = null;
}
const COLORS = (_theme && _theme.COLORS) || { primary: 0x5865f2 };
const truncate = (_theme && _theme.truncate) || ((s, max) => String(s ?? '').slice(0, max));

function agentChoices() {
  try {
    return agents.manifest.list().map((a) => ({ name: `${a.icon} ${a.name} — ${a.tagline}`.slice(0, 100), value: a.id }));
  } catch {
    return [];
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jarvis')
    .setDescription('Affida un compito a JARVIS e ai suoi agenti specialisti')
    .addStringOption((o) => o.setName('compito').setDescription('Cosa devono fare gli agenti').setRequired(true).setMaxLength(500))
    .addStringOption((o) => {
      o.setName('agente').setDescription('Forza uno specialista (default: JARVIS sceglie)');
      for (const c of agentChoices()) {
        try {
          o.addChoices(c);
        } catch {}
      }
      return o;
    }),
  cooldown: 10,
  async execute(interaction) {
    const compito = interaction.options.getString('compito', true).trim();
    const forced = interaction.options.getString('agente', false);
    if (!compito) {
      return interaction.reply({ content: '❌ Il compito non può essere vuoto.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    try {
      await interaction.deferReply();
    } catch {
      return;
    }

    const uid = interaction.user?.id;
    const pendingMsgs = new Map(); // approvalId -> message

    /** Mostra il cancello umano come bottoni Discord. */
    async function onApproval({ id, kind, title, detail }) {
      const label = kind === 'login' ? '🔑 Uso servizio' : kind === 'question' ? '❓ Domanda' : '⚠️ Azione';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`jarvis:ok:${id}`).setLabel('Approva').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`jarvis:no:${id}`).setLabel('Nega').setStyle(ButtonStyle.Danger).setEmoji('⛔')
      );
      let msg = null;
      try {
        msg = await interaction.followUp({
          content: `${label} richiesta da un agente:\n**${truncate(title, 200)}**\n${truncate(detail, 500)}`,
          components: [row],
        });
        pendingMsgs.set(id, msg);
        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: approvals.timeoutMs(),
          filter: (i) => i.customId === `jarvis:ok:${id}` || i.customId === `jarvis:no:${id}`,
        });
        collector.on('collect', async (i) => {
          if (i.user.id !== uid) {
            return i.reply({ content: '❌ Solo chi ha avviato il compito può approvare.', flags: MessageFlags.Ephemeral }).catch(() => null);
          }
          const ok = i.customId === `jarvis:ok:${id}`;
          approvals.resolve(id, ok, i.user.username);
          collector.stop(ok ? 'approvato' : 'negato');
          await i.update({ content: `${ok ? '✅ Approvato' : '⛔ Negato'}: **${truncate(title, 200)}**`, components: [] }).catch(() => null);
        });
        collector.on('end', async () => {
          try {
            await msg.edit({ components: [] }).catch(() => null);
          } catch {}
        });
      } catch {}
    }

    let res;
    try {
      res = await agents.run(compito, {
        guildId: interaction.guildId,
        userId: uid,
        userName: interaction.user?.username,
        agentId: forced || undefined,
        onApproval,
      });
    } catch (err) {
      await interaction.editReply(`⚠️ ${truncate(err?.message || 'Errore imprevisto.', 1500)}`).catch(() => null);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(res.ok ? COLORS.primary : 0xed4245)
      .setTitle(`${res.icon || '⚡'} ${res.agentName || 'JARVIS'}`)
      .addFields({ name: '📝 Compito', value: truncate(compito, 1024) || '—' })
      .setDescription(truncate(res.ok ? res.result : res.error, 4000) || '—')
      .setFooter({ text: truncate(`Sessione ${res.sessionId} • Control-room: /agents.html`, 2048) });
    try {
      embed.setTimestamp();
    } catch {}
    await interaction.editReply({ embeds: [embed] }).catch(() => null);
  },
};
