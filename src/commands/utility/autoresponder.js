const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { listTriggers, addTrigger, removeTrigger, clearTriggers, MAX_TRIGGERS, MAX_RESPONSE } = require('../../database/autoresponder');

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
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          content: '❌ Ti serve il permesso **Gestisci Messaggi** per usare questo comando.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'aggiungi') {
        const parola = interaction.options.getString('parola', true).trim();
        const risposta = interaction.options.getString('risposta', true);
        const modalita = interaction.options.getString('modalita') || 'include';

        if (!parola) {
          return interaction.reply({ content: '❌ La parola/pattern non può essere vuota.', flags: MessageFlags.Ephemeral });
        }
        if (risposta.length > MAX_RESPONSE) {
          return interaction.reply({
            content: `❌ Risposta troppo lunga (max ${MAX_RESPONSE} caratteri).`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const res = addTrigger(guildId, { match: parola, response: risposta, mode: modalita });
        if (!res.ok) {
          return interaction.reply({ content: `❌ ${res.error}`, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({
          content: `✅ Trigger aggiunto (ID \`${res.trigger.id}\`, modalità **${res.trigger.mode}**).\n🔑 \`${parola.slice(0, 200)}\`\n💬 ${risposta.slice(0, 300)}${risposta.length > 300 ? '…' : ''}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'rimuovi') {
        const id = interaction.options.getString('id', true).trim();
        const removed = removeTrigger(guildId, id);
        return interaction.reply({
          content: removed ? `✅ Trigger \`${id}\` rimosso.` : `❌ Nessun trigger con ID \`${id}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'lista') {
        const list = listTriggers(guildId);
        if (!list.length) {
          return interaction.reply({
            content: '📭 Nessuna risposta automatica configurata. Usa `/autoresponder aggiungi`.',
            flags: MessageFlags.Ephemeral,
          });
        }
        const lines = list.slice(0, 20).map((t, i) => {
          const preview = t.response.length > 80 ? `${t.response.slice(0, 80)}…` : t.response;
          const modeEmoji = t.mode === 'regex' ? '🔣' : t.mode === 'exact' ? '🎯' : '🔍';
          return `${modeEmoji} \`${t.id}\` • **${t.mode}** • ${i + 1}. 🔑 \`${String(t.match).slice(0, 100)}\` → ${preview}`;
        });
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Auto-responder (${list.length}/${MAX_TRIGGERS})`.slice(0, 256))
          .setDescription(lines.join('\n').slice(0, 4000) + (list.length > 20 ? `\n\n…e altri **${list.length - 20}** trigger.` : ''))
          .setFooter({ text: '🔍 include = contiene • 🎯 exact = esatta • 🔣 regex = pattern'.slice(0, 200) })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // pulisci
      const count = clearTriggers(guildId);
      return interaction.reply({
        content: count > 0 ? `🧹 Eliminati **${count}** trigger.` : '📭 Niente da eliminare: nessun trigger configurato.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      console.error('autoresponder:', e.message);
      const payload = { content: '❌ Errore durante l’operazione.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
