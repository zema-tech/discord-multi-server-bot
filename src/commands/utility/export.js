// export.js — /export con sottocomandi (un solo file = un solo comando per il loader):
//   /export server          → bundle JSON guild-scoped dei dati del server (allegato)
//   /export backup-ora      → esegue subito il backup notturno e mostra il report
//   /export backup-lista    → ultime 7 cartelle di backup con data/dimensione
//   /export backup-ripristina nome → ripristina un backup con doppia conferma
// Scelta documentata: i sottocomandi evitano collisioni con gli altri agenti
// (nessun nuovo file /backup separato) e restano sotto un unico permesso ManageGuild.

const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_DIR = path.join(ROOT, 'src', 'database');
const MAX_ATTACHMENT = 8 * 1024 * 1024; // limite Discord senza boost

// Tema premium condiviso, con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c };
let truncate = (s, max) => String(s ?? '').slice(0, max);
try {
  const theme = require('../../utils/theme');
  COLORS = theme.COLORS ?? COLORS;
  truncate = theme.truncate ?? truncate;
} catch { /* fallback inline sopra */ }

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDateIT(ts) {
  // BUGFIX: journal corrotto/incompleto (at mancante) → fallback a ora, mai "<t:NaN:f>".
  const n = Number(ts);
  return `<t:${Math.floor((Number.isFinite(n) ? n : Date.now()) / 1000)}:f>`;
}

/** Bundle guild-scoped: per ogni *.json, solo la fetta della guild se presente, altrimenti l'intero file (config globali). */
function buildGuildBundle(guild) {
  const collections = {};
  let skipped = 0;
  let files = [];
  try {
    files = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    throw new Error('cartella database non leggibile.');
  }
  for (const file of files) {
    const name = path.basename(file, '.json');
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(DB_DIR, file), 'utf8') || '{}');
    } catch {
      skipped++;
      continue;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.hasOwn(parsed, guild.id)) {
      collections[name] = parsed[guild.id];
    } else {
      collections[name] = parsed;
    }
  }
  return {
    bundle: {
      exportedAt: new Date().toISOString(),
      guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount ?? null },
      collections,
    },
    files: files.length,
    skipped,
  };
}

async function handleServer(interaction) {
  const { bundle, files, skipped } = buildGuildBundle(interaction.guild);
  const text = JSON.stringify(bundle, null, 2);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_ATTACHMENT) {
    return interaction.editReply(
      `❌ Export troppo grande (${fmtSize(bytes)}, limite ${fmtSize(MAX_ATTACHMENT)}).\n` +
      'Il database è cresciuto oltre il limite allegati: chiedi a un admin di copiare `src/database/*.json` a mano, ' +
      'oppure usa `/export backup-lista` per verificare i backup automatici.'
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const attachment = new AttachmentBuilder(Buffer.from(text, 'utf8'), {
    name: `export-${interaction.guild.id}-${stamp}.json`,
  });
  const names = Object.keys(bundle.collections).length;
  await interaction.editReply({
    content: `📦 Export di **${interaction.guild.name}**: ${names} collezioni da ${files} file${skipped ? ` (${skipped} file corrotti saltati)` : ''} — ${fmtSize(bytes)}.`,
    files: [attachment],
  });
}

async function handleBackupNow(interaction) {
  const { runBackupNow } = require('../../jobs/backup');
  const res = runBackupNow();
  const embed = new EmbedBuilder()
    .setColor(res.ok ? COLORS.success : COLORS.error)
    .setTitle(res.ok ? '✅ Backup completato' : '❌ Backup fallito')
    .setDescription(
      truncate(
      (res.dir ? `**Cartella:** \`${path.basename(res.dir)}\`\n` : '') +
      `**File copiati:** ${res.files.length}\n` +
      (res.pruned?.length ? `**Prune:** eliminate ${res.pruned.length} cartelle vecchie\n` : '') +
      (res.error ? `**Errore:** ${res.error}\n` : '') +
      (res.ok && res.files.length ? `\`${res.files.slice(0, 20).join('`, `')}\`${res.files.length > 20 ? ` …(+${res.files.length - 20})` : ''}` : ''),
      4000
      )
    )
    .setTimestamp(Number.isFinite(Number(res.at)) ? Number(res.at) : Date.now());
  await interaction.editReply({ embeds: [embed] });
}

async function handleBackupList(interaction) {
  const { listBackups, readJournal } = require('../../jobs/backup');
  const items = listBackups().slice(0, 7);
  const last = readJournal();
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('💾 Backup — ultime 7 cartelle')
    .setTimestamp();
  if (!items.length) {
    embed.setDescription(
      'Nessun backup trovato in `backups/`.\n' +
      'Il backup automatico gira ogni notte alle 03:00, oppure avviane uno subito con `/export backup-ora`.'
    );
  } else {
    embed.setDescription(
      items.map((b) => `📁 \`${b.name}\` — ${fmtDateIT(b.at || Date.now())} — **${fmtSize(b.size)}**`).join('\n') +
      (last ? `\n\n🕘 Ultimo backup: ${fmtDateIT(last.at)} — ${last.files?.length ?? 0} file — ${last.ok ? '✅ ok' : '❌ fallito'}` : '')
    );
  }
  await interaction.editReply({ embeds: [embed] });
}

function confirmRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:si`).setLabel('Ripristina').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
    new ButtonBuilder().setCustomId(`${prefix}:no`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
  );
}

function disabledRow(prefix) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:si:fin`).setLabel('Ripristina').setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId(`${prefix}:no:fin`).setLabel('Annulla').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
}

/** Conta i JSON ripristinabili in una cartella di backup (skip tmp/corrupt/illegeggibili). */
function countRestorable(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return { count: 0, names: [] };
  }
  const ok = names.filter((f) => {
    if (f.endsWith('.tmp') || f.includes('.corrupt-')) return false;
    try {
      JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8') || '{}');
      return true;
    } catch {
      return false;
    }
  });
  return { count: ok.length, names: ok };
}

async function handleBackupRestore(interaction) {
  const { listBackups, restoreBackup, isValidBackupName } = require('../../jobs/backup');
  const nome = (interaction.options.getString('nome', true) || '').trim();

  if (!isValidBackupName(nome)) {
    return interaction.editReply(
      `❌ Nome non valido: \`${nome.slice(0, 60)}\`.\n` +
      'Usa il formato `YYYY-MM-DD-HHmm` (vedi `/export backup-lista`).'
    );
  }
  const found = listBackups().find((b) => b.name === nome);
  if (!found) {
    return interaction.editReply(
      `❌ Backup \`${nome}\` non trovato in \`backups/\`.\n` +
      'Controlla il nome con `/export backup-lista`.'
    );
  }
  const { count, names } = countRestorable(found.dir);
  if (!count) {
    return interaction.editReply(`❌ Il backup \`${nome}\` non contiene file ripristinabili.`);
  }

  const uid = interaction.user.id;
  const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const prefix = `restore:${uid}:${nonce}`;
  const embed = new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle(`⚠️ Ripristinare il backup \`${truncate(nome, 40)}\`?`)
    .setDescription(
      `**Verranno sovrascritti ${count} file** in \`src/database/\`:\n` +
      `\`${names.slice(0, 20).join('`, `')}\`${count > 20 ? ` …(+${count - 20})` : ''}\n\n` +
      '✅ Prima del ripristino viene creato **automaticamente un backup di sicurezza** ' +
      '`pre-restore-<data-ora>` dello stato corrente, così potrai tornare indietro.\n' +
      '✅ **Nessun restart necessario**: i moduli rileggono i JSON da disco a ogni accesso.'
    )
    .setFooter({ text: 'Conferma entro 60 secondi • Solo chi ha avviato il comando può confermare' })
    .setTimestamp();
  const reply = await interaction.editReply({
    embeds: [embed],
    components: [confirmRow(prefix)],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (b) => b.customId.startsWith(prefix),
  });

  collector.on('collect', async (b) => {
    if (b.user.id !== uid) {
      return b.reply({ content: '❌ Solo chi ha avviato il comando può confermare.', flags: MessageFlags.Ephemeral });
    }
    if (b.customId === `${prefix}:no`) {
      collector.stop('annullato');
      return b.update({ content: '✅ Ripristino annullato, nessuna modifica applicata.', embeds: [], components: [] });
    }
    collector.stop('confermato');
    await b.deferUpdate();
    const res = restoreBackup(nome);
    const done = new EmbedBuilder()
      .setColor(res.ok ? COLORS.success : COLORS.error)
      .setTitle(res.ok ? `✅ Backup \`${truncate(nome, 40)}\` ripristinato` : '❌ Ripristino fallito')
      .setDescription(
        truncate(
          (res.safetyDir ? `**Backup di sicurezza:** \`${path.basename(res.safetyDir)}\`\n` : '') +
          `**File ripristinati:** ${res.restored.length}\n` +
          (res.restored.length ? `\`${res.restored.slice(0, 20).join('`, `')}\`${res.restored.length > 20 ? ` …(+${res.restored.length - 20})` : ''}\n` : '') +
          (res.skipped.length ? `**Saltati (tmp/corrupt):** ${res.skipped.length} — \`${res.skipped.slice(0, 10).join('`, `')}\`\n` : '') +
          (res.error ? `**Errore:** ${res.error}\n` : '') +
          '\n✅ Nessun restart necessario: i moduli rileggono i JSON da disco a ogni accesso.',
          4000
        )
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [done], components: [] });
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'confermato' || reason === 'annullato') return;
    await interaction
      .editReply({ content: '⏰ Tempo scaduto: nessuna modifica applicata.', components: [disabledRow(prefix)] })
      .catch(() => {});
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export dati del server e gestione backup (solo staff)')
    .addSubcommand((s) => s.setName('server').setDescription('Scarica un JSON con tutti i dati di questo server'))
    .addSubcommand((s) => s.setName('backup-ora').setDescription('Esegui subito il backup del database'))
    .addSubcommand((s) => s.setName('backup-lista').setDescription('Mostra gli ultimi 7 backup con data e dimensione'))
    .addSubcommand((s) =>
      s.setName('backup-ripristina')
        .setDescription('Ripristina un backup precedente (chiede conferma)')
        .addStringOption((o) =>
          o.setName('nome').setDescription('Cartella backup YYYY-MM-DD-HHmm (vedi /export backup-lista)').setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 30,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve **Gestisci Server**.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === 'server') return await handleServer(interaction);
      if (sub === 'backup-ora') return await handleBackupNow(interaction);
      if (sub === 'backup-lista') return await handleBackupList(interaction);
      if (sub === 'backup-ripristina') return await handleBackupRestore(interaction);
      return interaction.editReply({ content: '❌ Sottocomando sconosciuto.' });
    } catch (err) {
      await interaction.editReply({ content: `❌ Errore: ${err.message}` });
    }
  },
};
