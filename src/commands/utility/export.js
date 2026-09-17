// export.js — /export con sottocomandi (un solo file = un solo comando per il loader):
//   /export server       → bundle JSON guild-scoped dei dati del server (allegato)
//   /export backup-ora   → esegue subito il backup notturno e mostra il report
//   /export backup-lista → ultime 7 cartelle di backup con data/dimensione
// Scelta documentata: i sottocomandi evitano collisioni con gli altri agenti
// (nessun nuovo file /backup separato) e restano sotto un unico permesso ManageGuild.

const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_DIR = path.join(ROOT, 'src', 'database');
const MAX_ATTACHMENT = 8 * 1024 * 1024; // limite Discord senza boost

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDateIT(ts) {
  return `<t:${Math.floor(ts / 1000)}:f>`;
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
    .setColor(res.ok ? 0x57f287 : 0xed4245)
    .setTitle(res.ok ? '✅ Backup completato' : '❌ Backup fallito')
    .setDescription(
      (res.dir ? `**Cartella:** \`${path.basename(res.dir)}\`\n` : '') +
      `**File copiati:** ${res.files.length}\n` +
      (res.pruned?.length ? `**Prune:** eliminate ${res.pruned.length} cartelle vecchie\n` : '') +
      (res.error ? `**Errore:** ${res.error}\n` : '') +
      (res.ok && res.files.length ? `\`${res.files.slice(0, 20).join('`, `')}\`${res.files.length > 20 ? ` …(+${res.files.length - 20})` : ''}` : '')
    )
    .setTimestamp(res.at);
  await interaction.editReply({ embeds: [embed] });
}

async function handleBackupList(interaction) {
  const { listBackups, readJournal } = require('../../jobs/backup');
  const items = listBackups().slice(0, 7);
  const last = readJournal();
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export dati del server e gestione backup (solo staff)')
    .addSubcommand((s) => s.setName('server').setDescription('Scarica un JSON con tutti i dati di questo server'))
    .addSubcommand((s) => s.setName('backup-ora').setDescription('Esegui subito il backup del database'))
    .addSubcommand((s) => s.setName('backup-lista').setDescription('Mostra gli ultimi 7 backup con data e dimensione'))
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
      return interaction.editReply({ content: '❌ Sottocomando sconosciuto.' });
    } catch (err) {
      await interaction.editReply({ content: `❌ Errore: ${err.message}` });
    }
  },
};
