const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const { getGuild } = require('../../database/guildConfig');
const { load, save, dbFile } = require('../../database/jsonDb');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  const { EmbedBuilder: EB } = require('discord.js');
  theme = {
    COLORS: { gold: 0xfbd000, error: 0xed4245, success: 0x57f287 },
    err: (t) => new EB().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t).slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0xfbd000) => new EB().setColor(c).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? 'Utente'}` }); e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}

const SUGGEST_FILE = dbFile('suggest');

function nextNumber(guildId) {
  const raw = load(SUGGEST_FILE);
  // FIX: preserva le altre chiavi del file (prima save({counters}) cancellava tutto il resto).
  const db = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  // counters potrebbe essere null/corrotto: typeof null === 'object', accesso lancerebbe TypeError.
  const counters = db.counters && typeof db.counters === 'object' && !Array.isArray(db.counters) ? db.counters : {};
  const next = (Number(counters[guildId]) || 0) + 1;
  counters[guildId] = next;
  db.counters = counters;
  save(SUGGEST_FILE, db);
  return next;
}

async function addVotesAndThread(message, threadName) {
  if (!message) return;
  await message.react('✅').catch(() => {});
  await message.react('❌').catch(() => {});
  // FIX thread: crea il thread solo in canali testuali di guild che supportano i thread
  // (niente DM / vocali / categorie); autoArchiveDuration valida + reason; mai lanciare.
  try {
    const ch = message.channel;
    const supportsThreads =
      ch && typeof ch.isTextBased === 'function' && ch.isTextBased() && ch.isThreadOnly?.() !== true
      && typeof message.startThread === 'function' && !ch.isVoiceBased?.();
    if (!supportsThreads) return;
    if (typeof ch.getArchivedThreads === 'undefined' && ch.type !== undefined && ![0, 5, 15].includes(ch.type)) return;
    await message.startThread({
      name: String(threadName).slice(0, 100),
      autoArchiveDuration: 1440,
      reason: 'Discussione suggerimento',
    });
  } catch {
    // permessi mancanti o tipo canale non supportato: nessun errore per l'utente
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Invia un suggerimento per il server')
    .addStringOption((o) => o.setName('testo').setDescription('Il tuo suggerimento').setRequired(true)),
  cooldown: 10,
  async execute(interaction) {
    // Limite descrizione embed 4096 char: l'opzione slash ne ammette fino a 6000.
    const text = theme.truncate(String(interaction.options.getString('testo') || ''), 4000);
    const num = nextNumber(interaction.guild.id);
    const cfg = getGuild(interaction.guild.id);
    const embed = theme.info(
      theme.truncate(`💡 Suggerimento #${num}`, 256),
      `${text}\n\n✅ Vota **a favore** • ❌ Vota **contro**\n💬 Discuti nel thread dedicato!`,
      theme.COLORS.gold ?? 0xfbd000
    )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setAuthor({ name: `${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
    try { embed.setFooter({ text: `Suggerimento #${num} • In attesa di voti`.slice(0, 200) }); } catch {}
    theme.applyFooter(embed, interaction);
    try { embed.setFooter({ text: `Suggerimento #${num} • Richiesto da ${interaction.user.tag}`.slice(0, 200) }); } catch {}

    if (cfg.suggestChannelId) {
      const ch = await interaction.guild.channels.fetch(cfg.suggestChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        const m = await ch.send({ embeds: [embed] }).catch(() => null);
        if (!m) return interaction.reply({ embeds: [theme.err('Non riesco a inviare nel canale suggerimenti: controlla i miei permessi.')], flags: MessageFlags.Ephemeral });
        await addVotesAndThread(m, `💡 Suggerimento #${num} — discussione`.slice(0, 100));
        return interaction.reply({ content: `✅ Suggerimento #${num} inviato in ${ch}!`, flags: MessageFlags.Ephemeral });
      }
    }
    // FIX: withResponse può restituire { resource: { message } } oppure il Message diretto (versioni discord.js);
    // msg.resource.message lanciava TypeError se resource undefined → crash senza risposta.
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg?.resource?.message ?? msg?.message ?? (msg?.id ? msg : null);
    await addVotesAndThread(message, `💡 Suggerimento #${num} — discussione`.slice(0, 100));
  },
};
