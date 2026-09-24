const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, AttachmentBuilder,
} = require('discord.js');
const skills = require('../../brain/skills');
const memory = require('../../brain/memory');
const files = require('../../brain/files');
const people = require('../../brain/people');
const profile = require('../../brain/profile');

function needGuild(interaction) {
  if (!interaction.guild) {
    interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return false;
  }
  return true;
}

function needStaff(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    interaction.reply({ content: '❌ Ti serve **Gestisci Server**.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return false;
  }
  return true;
}

function err(interaction, msg) {
  return interaction.reply({ content: `❌ ${msg}`, flags: MessageFlags.Ephemeral }).catch(() => null);
}

async function downloadAttachment(att) {
  if (!att) throw new Error('Allega un file .txt o .md.');
  const name = String(att.name || '');
  if (!/\.(txt|md)$/i.test(name)) throw new Error('Solo file .txt o .md.');
  if (att.size > 100 * 1024) throw new Error('File troppo grande (max 100KB).');
  if (!att.url) throw new Error('URL allegato mancante.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(att.url, { signal: controller.signal });
    if (!res.ok) throw new Error('Download fallito.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 100 * 1024) throw new Error('File vuoto o troppo grande.');
    return { name, buf };
  } catch (e) {
    if (e.message.startsWith('File ') || e.message.startsWith('Solo ') || e.message.startsWith('Download')) throw e;
    throw new Error('Download fallito, riprova.');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('brain')
    .setDescription('Il cervello del bot: skill, memorie e file (stile Obsidian)')
    .addSubcommand((s) => s.setName('stato').setDescription('Statistiche del cervello del server'))
    .addSubcommand((s) => s.setName('skill-lista').setDescription('Elenca le skill attive'))
    .addSubcommand((s) => s.setName('skill-mostra').setDescription('Mostra una skill')
      .addStringOption((o) => o.setName('nome').setDescription('Nome skill').setRequired(true).setMaxLength(32)))
    .addSubcommand((s) => s.setName('skill-crea').setDescription('Crea una skill (staff)')
      .addStringOption((o) => o.setName('nome').setDescription('2-32 char a-z0-9-').setRequired(true).setMaxLength(32))
      .addStringOption((o) => o.setName('descrizione').setDescription('Cosa fa').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('trigger').setDescription('Parole chiave separate da virgola').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('istruzioni').setDescription('Istruzioni per l\u2019AI (max 2000)').setRequired(true).setMaxLength(2000)))
    .addSubcommand((s) => s.setName('skill-toggle').setDescription('Attiva/disattiva una skill (staff)')
      .addStringOption((o) => o.setName('nome').setDescription('Nome skill').setRequired(true).setMaxLength(32))
      .addBooleanOption((o) => o.setName('stato').setDescription('ON/OFF').setRequired(true)))
    .addSubcommand((s) => s.setName('skill-rimuovi').setDescription('Elimina una skill del server (staff)')
      .addStringOption((o) => o.setName('nome').setDescription('Nome skill').setRequired(true).setMaxLength(32)))
    .addSubcommand((s) => s.setName('memoria-salva').setDescription('Salva una nota nel cervello (staff)')
      .addStringOption((o) => o.setName('titolo').setDescription('Titolo nota').setRequired(true).setMaxLength(60))
      .addStringOption((o) => o.setName('testo').setDescription('Contenuto, usa [[Link]] e #tag').setRequired(true).setMaxLength(2000))
      .addStringOption((o) => o.setName('tag').setDescription('Tag separati da virgola').setRequired(false).setMaxLength(100)))
    .addSubcommand((s) => s.setName('memoria-cerca').setDescription('Cerca nelle memorie')
      .addStringOption((o) => o.setName('query').setDescription('Cosa cerchi').setRequired(true).setMaxLength(200)))
    .addSubcommand((s) => s.setName('memoria-lista').setDescription('Elenca le note'))
    .addSubcommand((s) => s.setName('memoria-mostra').setDescription('Mostra una nota (staff)')
      .addStringOption((o) => o.setName('titolo').setDescription('Titolo nota').setRequired(true).setMaxLength(60)))
    .addSubcommand((s) => s.setName('memoria-dimentica').setDescription('Elimina una nota (staff)')
      .addStringOption((o) => o.setName('titolo').setDescription('Titolo nota').setRequired(true).setMaxLength(60)))
    .addSubcommand((s) => s.setName('file-aggiungi').setDescription('Carica un file di riferimento .txt/.md (staff)')
      .addStringOption((o) => o.setName('nome').setDescription('Nome con cui salvarlo').setRequired(true).setMaxLength(60))
      .addAttachmentOption((o) => o.setName('allegato').setDescription('File .txt o .md (max 100KB)').setRequired(true)))
    .addSubcommand((s) => s.setName('file-lista').setDescription('Elenca i file caricati'))
    .addSubcommand((s) => s.setName('file-leggi').setDescription('Leggi un file (staff)')
      .addStringOption((o) => o.setName('nome').setDescription('Nome file').setRequired(true).setMaxLength(64)))
    .addSubcommand((s) => s.setName('file-rimuovi').setDescription('Elimina un file (staff)')
      .addStringOption((o) => o.setName('nome').setDescription('Nome file').setRequired(true).setMaxLength(64)))
    .addSubcommand((s) => s.setName('persona-mostra').setDescription('Mostra i ricordi su di te (o di un utente, staff)')
      .addUserOption((o) => o.setName('utente').setDescription('Utente (solo staff)').setRequired(false)))
    .addSubcommand((s) => s.setName('persona-dimentica').setDescription('Dimentica un ricordo (numero o testo)')
      .addStringOption((o) => o.setName('rif').setDescription('Numero dalla lista o parte del testo (o "tutto")').setRequired(true).setMaxLength(200))
      .addUserOption((o) => o.setName('utente').setDescription('Utente (solo staff)').setRequired(false)))
    .addSubcommand((s) => s.setName('profilo').setDescription('Mostra la scheda del server vista dall\u2019AI'))
    .addSubcommand((s) => s.setName('profilo-imposta').setDescription('Nota libera sul server per l\u2019AI (staff)')
      .addStringOption((o) => o.setName('testo').setDescription('Max 1000 caratteri').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('profilo-reset').setDescription('Rimuove la nota staff sul server (staff)')),
  cooldown: 5,
  async execute(interaction) {
    if (!needGuild(interaction)) return;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const staffOnly = (s) => [
      'skill-crea', 'skill-toggle', 'skill-rimuovi',
      'memoria-salva', 'memoria-mostra', 'memoria-dimentica',
      'file-aggiungi', 'file-leggi', 'file-rimuovi',
      'profilo-imposta', 'profilo-reset',
    ].includes(s);
    // persona-*: sui propri dati chiunque; sui dati altrui serve lo staff.
    const targetUser = interaction.options.getUser
      ? interaction.options.getUser('utente', false)
      : null;
    if ((sub === 'persona-mostra' || sub === 'persona-dimentica') && targetUser && targetUser.id !== interaction.user.id) {
      if (!needStaff(interaction)) return;
    }

    try {
      // ---- stato ----
      if (sub === 'stato') {
        const sk = skills.listSkills(gid);
        const notes = memory.listNotes(gid);
        const fs_ = files.listFiles(gid);
        const bytes = files.guildBytes(gid);
        const np = people.countPeople(gid);
        const hasProfile = profile.getOverride(gid) ? 'sì' : 'no';
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🧠 Cervello del server')
          .setDescription(
            `**Skill:** ${sk.filter((s) => s.enabled).length}/${sk.length} attive\n` +
            `**Memorie:** ${notes.length} note\n` +
            `**File:** ${fs_.length} (${Math.round(bytes / 1024)}KB / 1024KB)\n` +
            `**Persone:** ${np} con ricordi\n` +
            `**Scheda server:** ${hasProfile === 'sì' ? 'auto + nota staff' : 'auto'}\n\n` +
            'L\u2019AI usa skill, memorie, file, scheda server e ricordi per rispondere in modo pertinente (/chiedi, menzioni, ticket).'
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      // ---- skill ----
      if (sub === 'skill-lista') {
        const sk = skills.listSkills(gid);
        if (!sk.length) return err(interaction, 'Nessuna skill.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🧠 Skill (${sk.length})`)
          .setDescription(sk.map((s) => `${s.enabled ? '🟢' : '⚪'} **${s.name}** — ${s.description || '—'}`).join('\n').slice(0, 4000))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'skill-mostra') {
        const nome = interaction.options.getString('nome', true);
        const sk = skills.listSkills(gid).find((s) => s.name === nome.toLowerCase().trim());
        if (!sk) return err(interaction, 'Skill non trovata.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🧠 ${sk.name} ${sk.enabled ? '(attiva)' : '(disattivata)'}`)
          .setDescription(`${sk.description || '—'}\n\n**Trigger:** ${(sk.triggers || []).join(', ') || '—'}\n\n${sk.instructions || '—'}`.slice(0, 4000))
          .setFooter({ text: `Scope: ${sk.scope}` })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      // ---- persone e profilo ----
      if (sub === 'persona-mostra') {
        const uid = targetUser ? targetUser.id : interaction.user.id;
        const facts = people.getFacts(gid, uid);
        const label = targetUser ? `<@${uid}>` : 'te';
        if (!facts.length) return err(interaction, `Nessun ricordo su ${label}. L\u2019AI memorizza i fatti importanti che dici (es. "ricordati che odio il giallo").`);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🧑 Ricordi su ${targetUser ? targetUser.username : 'di te'} (${facts.length})`)
          .setDescription(facts.map((f, i) => `**${i + 1}.** ${f}`).join('\n').slice(0, 4000))
          .setFooter({ text: 'Dimentica con /brain persona-dimentica' })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'persona-dimentica') {
        const uid = targetUser ? targetUser.id : interaction.user.id;
        const rif = interaction.options.getString('rif', true);
        if (rif.trim().toLowerCase() === 'tutto') {
          const ok = people.forgetAll(gid, uid);
          return interaction.reply({ content: ok ? '✅ Tutti i ricordi dimenticati.' : '❌ Nessun ricordo da dimenticare.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        const removed = people.removeFact(gid, uid, rif);
        return interaction.reply({ content: removed ? `✅ Dimenticato: "${removed.slice(0, 150)}"` : '❌ Ricordo non trovato (usa il numero di `/brain persona-mostra`).', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'profilo') {
        const scheda = profile.getProfile(interaction.guild, gid);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🏰 Scheda del server')
          .setDescription((scheda || 'Nessuna informazione.').slice(0, 4000))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (staffOnly(sub) && !needStaff(interaction)) return;

      if (sub === 'profilo-imposta') {
        profile.saveOverride(gid, interaction.options.getString('testo', true));
        return interaction.reply({ content: '✅ Nota server salvata: l\u2019AI la userà come contesto.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'profilo-reset') {
        const ok = profile.clearOverride(gid);
        return interaction.reply({ content: ok ? '✅ Nota server rimossa.' : '❌ Nessuna nota da rimuovere.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (staffOnly(sub) && !needStaff(interaction)) return;

      if (sub === 'skill-crea') {
        const n = skills.saveSkill(gid, {
          name: interaction.options.getString('nome', true),
          description: interaction.options.getString('descrizione', true),
          triggers: interaction.options.getString('trigger', true),
          instructions: interaction.options.getString('istruzioni', true),
          enabled: true,
        });
        return interaction.reply({ content: `✅ Skill **${n}** creata e attiva.`, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'skill-toggle') {
        const n = skills.setEnabled(gid, interaction.options.getString('nome', true), interaction.options.getBoolean('stato', true));
        return interaction.reply({ content: `✅ Skill **${n}** aggiornata.`, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'skill-rimuovi') {
        const ok = skills.removeSkill(gid, interaction.options.getString('nome', true));
        return interaction.reply({ content: ok ? '✅ Skill eliminata.' : '❌ Skill non trovata (quelle globali non si eliminano).', flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      // ---- memorie ----
      if (sub === 'memoria-salva') {
        const t = memory.saveNote(
          gid,
          interaction.options.getString('titolo', true),
          interaction.options.getString('testo', true),
          interaction.options.getString('tag', false) || []
        );
        return interaction.reply({ content: `✅ Nota **${t}** salvata.`, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'memoria-cerca') {
        const hits = memory.searchNotes(gid, interaction.options.getString('query', true), 5);
        if (!hits.length) return err(interaction, 'Nessuna memoria trovata.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Memorie (${hits.length})`)
          .setDescription(hits.map((h) => `**${h.note.title}**${h.note.tags.length ? ` [#${h.note.tags.join(' #')}]` : ''}\n${h.note.body.slice(0, 200)}`).join('\n\n').slice(0, 4000))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'memoria-lista') {
        const notes = memory.listNotes(gid);
        if (!notes.length) return err(interaction, 'Nessuna nota. Usa `/brain memoria-salva`.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Note (${notes.length})`)
          .setDescription(notes.map((n) => `**${n.title}**${n.tags.length ? ` [#${n.tags.join(' #')}]` : ''}${n.links.length ? ` → [[${n.links.join(']] [[')}]]` : ''}`).join('\n').slice(0, 4000))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'memoria-mostra') {
        const note = memory.getNote(gid, interaction.options.getString('titolo', true));
        if (!note) return err(interaction, 'Nota non trovata.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 ${note.title}`)
          .setDescription(`${note.body.slice(0, 3500)}${note.backlinks.length ? `\n\n🔗 Linkata da: ${note.backlinks.join(', ')}` : ''}`)
          .setFooter({ text: note.tags.length ? `#${note.tags.join(' #')}` : 'nessun tag' })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'memoria-dimentica') {
        const ok = memory.deleteNote(gid, interaction.options.getString('titolo', true));
        return interaction.reply({ content: ok ? '✅ Nota dimenticata.' : '❌ Nota non trovata.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      // ---- file ----
      if (sub === 'file-aggiungi') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
        try {
          const att = interaction.options.getAttachment('allegato', true);
          const { name, buf } = await downloadAttachment(att);
          const saved = files.saveFile(gid, interaction.options.getString('nome', true), buf);
          await interaction.editReply({ content: `✅ File **${saved}** caricato (${Math.round(buf.length / 1024)}KB).` }).catch(() => null);
        } catch (e) {
          await interaction.editReply({ content: `❌ ${e.message}` }).catch(() => null);
        }
        return;
      }
      if (sub === 'file-lista') {
        const list = files.listFiles(gid);
        if (!list.length) return err(interaction, 'Nessun file. Usa `/brain file-aggiungi`.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📄 File (${list.length})`)
          .setDescription(list.map((f) => `**${f.name}** (${Math.round(f.bytes / 1024)}KB)`).join('\n').slice(0, 4000))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'file-leggi') {
        const stored = files.readStored(gid, interaction.options.getString('nome', true), 3500);
        if (!stored) return err(interaction, 'File non trovato.');
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📄 ${stored.name}`)
          .setDescription('```\n' + stored.content.slice(0, 3500) + '\n```' + (stored.truncated ? `\n*…troncato (${stored.totalChars} char)*` : ''))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      if (sub === 'file-rimuovi') {
        const ok = files.deleteStored(gid, interaction.options.getString('nome', true));
        return interaction.reply({ content: ok ? '✅ File eliminato.' : '❌ File non trovato.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    } catch (e) {
      return err(interaction, e.message || 'Errore.');
    }
  },
};
