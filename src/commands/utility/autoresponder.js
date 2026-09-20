const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { listTriggers, MAX_TRIGGERS, MAX_RESPONSE } = require('../../database/autoresponder');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}

const truncate = theme?.truncate ?? ((s, max) => String(s ?? '').slice(0, max));

function withFooter(embed, interaction) {
  if (theme?.applyFooter) {
    try {
      theme.applyFooter(embed, interaction);
    } catch {
      // footer non critico
    }
    return embed;
  }
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente'}` });
  } catch {
    // ignora
  }
  return embed;
}

function errorEmbed(text, interaction) {
  const e = theme?.err ? theme.err(text) : new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text ?? '').slice(0, 4000)).setTimestamp();
  return interaction ? withFooter(e, interaction) : e;
}

// Configurazione solo dalla dashboard web: nessun accesso in scrittura al DB da qui.
function dashboardMessaggio(guildId, sezione) {
  const base = (process.env.BASE_URL || '').trim().replace(/\/+$/, '') || 'apri la dashboard del bot';
  return `La configurazione si fa dalla dashboard: ${base}/app.html#gid=${guildId} — sezione ${sezione}`;
}

function infoEmbed(title, description, interaction) {
  let e;
  if (theme?.info) e = theme.info(title, description);
  else e = new EmbedBuilder().setColor(0x5865f2).setTitle(String(title).slice(0, 256)).setDescription(String(description).slice(0, 4000)).setTimestamp();
  return withFooter(e, interaction);
}

function hasManageMessages(interaction) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  try {
    return Boolean(perms?.has(PermissionFlagsBits.ManageMessages));
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Risposte automatiche a parole chiave o regex (stile PeakBot)')
    .addSubcommand((s) =>
      s
        .setName('aggiungi')
        .setDescription('Aggiungi una risposta automatica')
        .addStringOption((o) =>
          o.setName('parola').setDescription('Parola chiave o pattern da rilevare').setRequired(true).setMaxLength(500)
        )
        .addStringOption((o) =>
          o.setName('risposta').setDescription('Risposta del bot (max 1500 caratteri, {user} = menzione)').setRequired(true).setMaxLength(MAX_RESPONSE)
        )
        .addStringOption((o) =>
          o
            .setName('modalita')
            .setDescription('Tipo di confronto (default: include)')
            .setRequired(false)
            .addChoices(
              { name: 'include (contiene)', value: 'include' },
              { name: 'exact (esatta)', value: 'exact' },
              { name: 'regex', value: 'regex' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('rimuovi')
        .setDescription('Rimuovi una risposta automatica tramite ID')
        .addStringOption((o) => o.setName('id').setDescription('ID del trigger (vedi /autoresponder lista)').setRequired(true))
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra tutte le risposte automatiche'))
    .addSubcommand((s) => s.setName('pulisci').setDescription('Elimina tutte le risposte automatiche'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldown: 3,
  async execute(interaction) {
    try {
      // FIX: senza guild, guildId=null inquinava il DB con chiave "null" (clearTriggers salvava db[null]=[]).
      if (!interaction.guild && !interaction.guildId) {
        return interaction.reply({
          embeds: [errorEmbed('Usa questo comando dentro un server.', interaction)],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
      if (!hasManageMessages(interaction)) {
        return interaction.reply({
          embeds: [errorEmbed('Ti serve il permesso **Gestisci Messaggi** per usare questo comando.', interaction)],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId ?? interaction.guild?.id;

      // Configurazione (aggiungi/rimuovi/pulisci) solo dalla dashboard web.
      if (sub === 'aggiungi' || sub === 'rimuovi' || sub === 'pulisci') {
        return interaction.reply({ content: dashboardMessaggio(guildId, 'Risposte automatiche'), flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      if (sub === 'lista') {
        const list = listTriggers(guildId);
        if (!list.length) {
          return interaction.reply({
            embeds: [infoEmbed('📭 Auto-responder', 'Nessuna risposta automatica configurata. Usa `/autoresponder aggiungi`.', interaction)],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        const lines = list.slice(0, 20).map((t, i) => {
          const preview = t.response.length > 80 ? `${t.response.slice(0, 80)}…` : t.response;
          const modeEmoji = t.mode === 'regex' ? '🔣' : t.mode === 'exact' ? '🎯' : '🔍';
          return `${modeEmoji} \`${t.id}\` • **${t.mode}** • ${i + 1}. 🔑 \`${truncate(String(t.match), 100)}\` → ${preview}`;
        });
        const embed = infoEmbed(
          `📝 Auto-responder (${list.length}/${MAX_TRIGGERS})`,
          truncate(lines.join('\n'), 4000) + (list.length > 20 ? `\n\n…e altri **${list.length - 20}** trigger.` : ''),
          interaction
        );
        try {
          embed.setFooter({ text: '🔍 include = contiene • 🎯 exact = esatta • 🔣 regex = pattern'.slice(0, 200) });
        } catch {
          // ignora
        }
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      // pulisci: configurazione solo dalla dashboard (ramo gia gestito sopra).
      return null;
    } catch (e) {
      console.error('autoresponder:', e?.message ?? e);
      const payload = { embeds: [errorEmbed('Errore durante l’operazione.', interaction)], flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      } catch {
        // mai lanciare
      }
      return null;
    }
  },
};
