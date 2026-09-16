const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const ms = require('ms');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea un sondaggio con reazioni')
    .addStringOption((o) => o.setName('domanda').setDescription('La domanda del sondaggio').setRequired(true))
    .addStringOption((o) => o.setName('opzioni').setDescription('Opzioni separate da | (max 10, default Sì/No)').setRequired(false))
    .addStringOption((o) => o.setName('durata').setDescription('Chiusura automatica: 10m, 1h, 1d (opzionale)').setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    // Titolo embed max 256 char, descrizione max 4096: le opzioni slash non hanno maxLength.
    const question = String(interaction.options.getString('domanda') || '').slice(0, 200);
    const raw = interaction.options.getString('opzioni');
    const durataRaw = interaction.options.getString('durata');
    const options = raw ? raw.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 10).map((o) => o.slice(0, 100)) : ['Sì', 'No'];
    if (options.length < 2) return interaction.reply({ content: '❌ Servono almeno 2 opzioni.', flags: MessageFlags.Ephemeral });

    let autoCloseMs = null;
    if (durataRaw) {
      autoCloseMs = ms(durataRaw);
      if (!autoCloseMs || autoCloseMs < 30000 || autoCloseMs > 7 * 24 * 3600 * 1000)
        return interaction.reply({ content: '❌ Durata non valida (min 30s, max 7g). Esempi: `10m`, `1h`, `1d`.', flags: MessageFlags.Ephemeral });
    }

    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const desc = options.map((o, i) => `${emoji[i]} ${o}`).join('\n');
    const endsAt = autoCloseMs ? Date.now() + autoCloseMs : null;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ${question}`)
      .setDescription(desc + (endsAt ? `\n\n⏳ Chiude <t:${Math.floor(endsAt / 1000)}:R>` : ''))
      .setFooter({ text: `Sondaggio di ${interaction.user.tag}` })
      .setTimestamp();
    const msg = await interaction.reply({ embeds: [embed], withResponse: true });
    const message = msg.resource.message;
    for (let i = 0; i < options.length; i++) await message.react(emoji[i]);

    // Chiusura automatica: conta reazioni e pubblica i risultati.
    if (autoCloseMs) {
      const timer = setTimeout(async () => {
        try {
          const fresh = await message.fetch().catch(() => null);
          if (!fresh) return;
          const counts = [];
          for (let i = 0; i < options.length; i++) {
            const r = fresh.reactions.cache.get(emoji[i]);
            counts.push(r ? Math.max(0, r.count - 1) : 0); // -1 per togliere il voto del bot
          }
          const total = counts.reduce((a, b) => a + b, 0);
          const max = Math.max(...counts);
          const winnerIdx = counts.map((c, i) => (c === max && max > 0 ? i : -1)).filter((i) => i >= 0);
          const lines = options.map((o, i) => `${emoji[i]} ${o}: **${counts[i]}** voti`).join('\n');
          const winnerLine = max <= 0 ? 'Nessun voto ricevuto.' : `🏆 Vincitore: **${winnerIdx.map((i) => options[i]).join('**, **')}** (${max} voti)`;
          const res = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(`📊 Risultati: ${question}`)
            .setDescription(`${lines}\n\nTotale voti: **${total}**\n${winnerLine}`)
            .setFooter({ text: `Sondaggio di ${interaction.user.tag}` })
            .setTimestamp();
          await fresh.reply({ embeds: [res] }).catch(() => message.channel.send({ embeds: [res] }).catch(() => {}));
        } catch (e) {
          console.error('poll end:', e.message);
        }
      }, autoCloseMs);
      timer.unref?.();
    }
  },
};
