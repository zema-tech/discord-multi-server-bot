const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const { getGuild } = require('../../database/guildConfig');
const { load, save, dbFile } = require('../../database/jsonDb');

const SUGGEST_FILE = dbFile('suggest');

function nextNumber(guildId) {
  const data = load(SUGGEST_FILE);
  // counters potrebbe essere null/corrotto: typeof null === 'object', accesso lancerebbe TypeError.
  const counters = data && data.counters && typeof data.counters === 'object' ? data.counters : {};
  const next = (counters[guildId] ?? 0) + 1;
  counters[guildId] = next;
  save(SUGGEST_FILE, { counters });
  return next;
}

async function addVotesAndThread(message, threadName) {
  await message.react('✅').catch(() => {});
  await message.react('❌').catch(() => {});
  // Thread di discussione automatico: se il canale non lo supporta, ignora in silenzio.
  try {
    if (typeof message.startThread === 'function') {
      await message.startThread({ name: threadName, autoArchiveDuration: 1440 });
    }
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
    const text = String(interaction.options.getString('testo') || '').slice(0, 4000);
    const num = nextNumber(interaction.guild.id);
    const cfg = getGuild(interaction.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0xfbd000)
      .setTitle(`💡 Suggerimento #${num}`.slice(0, 256))
      .setDescription(`${text}\n\n✅ Vota **a favore** • ❌ Vota **contro**\n💬 Discuti nel thread dedicato!`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setAuthor({ name: `${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setFooter({ text: `Suggerimento #${num} • In attesa di voti`.slice(0, 200) })
      .setTimestamp();

    if (cfg.suggestChannelId) {
      const ch = await interaction.guild.channels.fetch(cfg.suggestChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        const m = await ch.send({ embeds: [embed] }).catch(() => null);
        if (!m) return interaction.reply({ content: '❌ Non riesco a inviare nel canale suggerimenti: controlla i miei permessi.', flags: MessageFlags.Ephemeral });
        await addVotesAndThread(m, `💡 Suggerimento #${num} — discussione`.slice(0, 100));
        return interaction.reply({ content: `✅ Suggerimento #${num} inviato in ${ch}!`, flags: MessageFlags.Ephemeral });
      }
    }
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    await addVotesAndThread(message, `💡 Suggerimento #${num} — discussione`.slice(0, 100));
  },
};
