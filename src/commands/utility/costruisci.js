const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { askAI } = require('../../utils/ai');
const { validateBlueprint, applyBlueprint, describeBlueprint } = require('../../utils/blueprints');

// Tema premium condiviso, con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c };
let themeErr = (text) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text ?? '').slice(0, 4000)).setTimestamp();
let applyFooter = (embed, interaction) => {
  try {
    embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? interaction?.user?.username ?? 'Utente'}`.slice(0, 200) });
    embed.setTimestamp();
  } catch { /* footer non critico */ }
  return embed;
};
let truncate = (s, max) => String(s ?? '').slice(0, max);
try {
  const theme = require('../../utils/theme');
  COLORS = theme.COLORS ?? COLORS;
  themeErr = theme.err ?? themeErr;
  applyFooter = theme.applyFooter ?? applyFooter;
  truncate = theme.truncate ?? truncate;
} catch { /* fallback inline sopra */ }

/** Estrae il primo blocco { ... } dalla risposta AI (cerca primo '{' → ultimo '}'). */
function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildPrompt(descrizione) {
  return (
    `Crea la struttura di un server Discord a partire da questa descrizione: "${descrizione}".\n` +
    'Rispondi SOLO con JSON valido, senza markdown né altro testo, in questo formato esatto:\n' +
    '{"categories":[{"name":"NOME CATEGORIA","channels":[{"name":"nome-canale","type":"text|voice"}]}],"roles":[{"name":"Nome Ruolo","color":"#rrggbb"}]}\n' +
    'Regole: max 5 categorie, max 12 canali in totale, max 5 ruoli. Nomi in italiano. ' +
    'Canali testuali in minuscolo con trattini (es. chat-generale), vocali con maiuscola (es. Sala 1). ' +
    'Colori ruoli in esadecimale (es. #5865f2).'
  );
}

const SYSTEM_PROMPT = 'Sei un assistente che progetta server Discord. Rispondi solo con JSON valido, senza markdown né testo extra.';

function confirmRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:si`).setLabel('Crea tutto').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${prefix}:no`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
  );
}

function disabledRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:si:fin`).setLabel('Crea tutto').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId(`${prefix}:no:fin`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('costruisci')
    .setDescription('Genera la struttura del server con la AI da una descrizione')
    .addStringOption((o) =>
      o.setName('descrizione').setDescription('Es. "server gaming con tornei e area chill" (max 500 caratteri)').setRequired(true).setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 60,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
    }
    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || !me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [themeErr('Mi servono i permessi **Gestisci Ruoli** e **Gestisci Canali** per costruire la struttura.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const descrizione = interaction.options.getString('descrizione', true).trim();
    await interaction.deferReply();

    // 1) Chiedo alla AI un JSON STRICT.
    let raw;
    try {
      raw = await askAI(buildPrompt(descrizione), SYSTEM_PROMPT);
    } catch {
      return interaction.editReply({
        embeds: [themeErr('AI non disponibile al momento, riprova più tardi. Nessuna modifica applicata.')],
      });
    }

    // 2) Estraggo il JSON: se manca o è invalido → stop, NESSUNA creazione parziale.
    const parsed = extractJson(raw);
    if (!parsed) {
      return interaction.editReply({
        embeds: [themeErr('Non sono riuscito a generare una struttura valida dalla descrizione (risposta AI non valida). Riprova con una descrizione più semplice. Nessuna modifica applicata.')],
      });
    }
    const v = validateBlueprint(parsed);
    if (!v.ok || !v.blueprint) {
      return interaction.editReply({
        embeds: [themeErr(`Struttura generata non valida: ${v.errors[0] || 'contenuto mancante.'} Riprova con una descrizione diversa. Nessuna modifica applicata.`)],
      });
    }

    const warningsLine =
      v.warnings.length > 0 ? `\n\n⚠️ Note automatiche:\n${v.warnings.slice(0, 5).map((w) => `• ${w}`).join('\n')}` : '';
    const embed = applyFooter(
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🏗️ Struttura proposta dalla AI ✨')
        .setDescription(truncate(`${describeBlueprint(v.blueprint)}${warningsLine}`, 4000))
        .setFooter({ text: 'Conferma entro 60 secondi • Non verrà cancellato nulla di esistente'.slice(0, 200) }),
      interaction
    );

    const uid = interaction.user.id;
    const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const prefix = `costruisci:${uid}:${nonce}`;

    const reply = await interaction.editReply({
      content: `Hai chiesto: "${descrizione.slice(0, 200)}"\n⚠️ Creare questa struttura? Hai 60 secondi.`,
      embeds: [embed],
      components: [confirmRow(prefix)],
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.customId.startsWith(prefix),
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== uid) {
        return i.reply({ content: '❌ Solo chi ha avviato il comando può confermare.', flags: MessageFlags.Ephemeral });
      }
      if (i.customId === `${prefix}:no`) {
        collector.stop('annullato');
        return i.update({ content: '✅ Costruzione annullata, nessuna modifica applicata.', embeds: [], components: [] });
      }
      collector.stop('confermato');
      await i.deferUpdate();
      let report;
      try {
        report = await applyBlueprint(interaction.guild, v.blueprint, `Costruisci AI | Mod: ${interaction.user.tag}`);
      } catch (e) {
        return interaction.editReply({ embeds: [themeErr(`Errore: ${truncate(e.message || e, 3000)}`)], components: [] });
      }
      const done = applyFooter(
        new EmbedBuilder()
          .setColor(report.failed.length ? COLORS.warn : COLORS.success)
          .setTitle('✅ Struttura creata!')
          .setDescription(
            truncate(
              `🎭 Ruoli creati: **${report.roles.length}**\n📁💬 Canali/categorie creati: **${report.channels.length}**` +
                (report.failed.length > 0
                  ? `\n⚠️ Non riusciti (**${report.failed.length}**):\n${report.failed.slice(0, 10).map((f) => `• ${truncate(f.cosa, 80)}: ${truncate(f.errore, 200)}`).join('\n')}`
                  : '\n✅ Tutto creato senza errori.'),
              4000
            )
          ),
        interaction
      );
      await interaction.editReply({ content: '', embeds: [done], components: [] });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'confermato' || reason === 'annullato') return;
      await interaction
        .editReply({ content: '⏰ Tempo scaduto: nessuna modifica applicata.', components: [disabledRow(prefix)] })
        .catch(() => {});
    });
  },
  // Export per test senza Discord.
  extractJson,
  buildPrompt,
};
