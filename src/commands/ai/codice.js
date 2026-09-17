const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { askAI } = require('../../utils/ai');
const { buildTree, readFile, searchCode, codeSummary } = require('../../utils/codebase');

const MAX_FILES_STEP1 = 4;

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function answerAboutCode(question) {
  const tree = buildTree();
  const fileList = tree.files.map((f) => f.rel).join('\n');
  const pickerSystem = 'Sei il selettore file di un bot Discord. Rispondi SOLO con un array JSON di percorsi file.';
  const pickerPrompt =
    `Domanda sul codice: "${question}"\n\nFile disponibili:\n${fileList}\n\n` +
    `Quali max ${MAX_FILES_STEP1} file servono per rispondere? Rispondi SOLO con JSON tipo ["src/commands/ai/chiedi.js"]. Se nessuno è pertinente, rispondi [].`;
  let picked = [];
  try {
    const raw = await askAI(pickerPrompt, pickerSystem);
    picked = extractJsonArray(raw) || [];
  } catch {
    picked = [];
  }
  const valid = [...new Set(picked)].filter((p) => typeof p === 'string' && tree.files.some((f) => f.rel === p)).slice(0, MAX_FILES_STEP1);

  let context = '';
  for (const rel of valid) {
    try {
      const { content, truncated } = readFile(rel, 5000);
      context += `\n\n===== ${rel}${truncated ? ' (troncato)' : ''} =====\n${content}`;
    } catch {}
  }
  if (!context) {
    const hits = searchCode(question.split(/\s+/).filter((w) => w.length > 3)[0] || question, 6);
    if (hits.length) {
      context = '\n\nSnippet trovati:\n' + hits.map((h) => `${h.file}:${h.line}: ${h.snippet}`).join('\n');
    }
  }
  const finalSystem =
    'Sei CodeBot, esperto del codice del bot Discord che stai servendo. Rispondi in italiano, conciso (max 1400 caratteri), ' +
    'citando file e righe quando utile. Se non sai la risposta dal contesto, dillo.';
  const answer = await askAI(`Contesto codice:${context || ' (nessun file pertinente)'}\n\nDomanda: ${question}`, finalSystem);
  return { answer, files: valid };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('codice')
    .setDescription('Chiedi all\u2019AI cose sul codice del bot')
    .addSubcommand((s) =>
      s.setName('chiedi').setDescription('Fai una domanda sul codice del bot')
        .addStringOption((o) => o.setName('domanda').setDescription('Es. come funziona il daily?').setRequired(true).setMaxLength(500))
    )
    .addSubcommand((s) =>
      s.setName('file').setDescription('Mostra un file del bot (prime righe)')
        .addStringOption((o) => o.setName('percorso').setDescription('Es. src/commands/ai/chiedi.js').setRequired(true).setMaxLength(200))
    )
    .addSubcommand((s) =>
      s.setName('cerca').setDescription('Cerca un termine nel codice')
        .addStringOption((o) => o.setName('termine').setDescription('Es. cooldown').setRequired(true).setMaxLength(100))
    )
    .addSubcommand((s) => s.setName('albero').setDescription('Panoramica della struttura del codice')),
  cooldown: 10,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'albero') {
      const tree = buildTree();
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🌳 Struttura del codice')
        .setDescription(`**${tree.total} file JS** — ${tree.commands} comandi, ${tree.events} eventi\n\n${codeSummary().split('\n').slice(2).join('\n').slice(0, 3500)}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'file') {
      const percorso = interaction.options.getString('percorso', true).trim();
      try {
        const { content, truncated, totalChars } = readFile(percorso, 1800);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📄 ${percorso}`)
          .setDescription('```js\n' + content.slice(0, 1800) + '\n```' + (truncated ? `\n*…troncato (${totalChars} char totali)*` : ''))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch {
        return interaction.reply({ content: '❌ Percorso non valido. Usa `/codice albero` per vedere i file.', flags: MessageFlags.Ephemeral });
      }
    }

    if (sub === 'cerca') {
      const termine = interaction.options.getString('termine', true).trim();
      const hits = searchCode(termine, 10);
      if (!hits.length) return interaction.reply({ content: `🔍 Nessun risultato per \`${termine}\`.`, flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🔍 "${termine}" (${hits.length})`)
        .setDescription(hits.map((h) => `\`${h.file}:${h.line}\`\n${h.snippet}`).join('\n\n').slice(0, 4000))
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // chiedi
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Ti serve **Gestisci Server** per interrogare il codice.', flags: MessageFlags.Ephemeral });
    }
    const domanda = interaction.options.getString('domanda', true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { answer, files } = await answerAboutCode(domanda);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🤖 Il bot spiega il suo codice')
        .setDescription(answer.slice(0, 4000))
        .setFooter({ text: files.length ? `Fonti: ${files.join(', ')}` : 'Nessun file specifico' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `❌ ${err.message || 'AI non disponibile, riprova più tardi.'}` });
    }
  },
};
