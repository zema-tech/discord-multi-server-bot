const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType,
} = require('discord.js');

// Tema premium condiviso, con fallback inline se il require fallisse.
let T = null;
try {
  T = require('../../utils/theme');
} catch {
  T = null;
}
const COLORS = T?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
const themeBar = typeof T?.bar === 'function'
  ? T.bar
  : (cur, max, len = 10) => {
      const m = Number(max) > 0 ? Number(cur) / Number(max) : 0;
      const r = Math.min(1, Math.max(0, m || 0));
      const f = Math.round(r * len);
      return '█'.repeat(f) + '░'.repeat(len - f);
    };
const trunc = typeof T?.truncate === 'function' ? T.truncate : (s, m) => String(s ?? '').slice(0, m);

// 24 dilemmi IT: ogni utente vota A o B con i bottoni.
const DILEMMI = [
  { a: 'Avere WiFi ovunque ma lentissimo', b: 'Avere WiFi velocissimo ma solo a casa' },
  { a: 'Non poter più usare gli emoji', b: 'Non poter più usare i meme' },
  { a: 'Vivere senza smartphone per un anno', b: 'Vivere senza pizza per un anno' },
  { a: 'Sapere sempre quando qualcuno mente', b: 'Poterti teletrasportare ovunque' },
  { a: 'Essere bravissimo nei videogiochi ma sconosciuto', b: 'Essere mediocre ma famoso come streamer' },
  { a: 'Dormire 10 ore ma svegliarti sempre stanco', b: 'Dormire 4 ore ma svegliarti pieno di energie' },
  { a: 'Potere parlare con gli animali', b: 'Potere parlare tutte le lingue del mondo' },
  { a: 'Vincere 10.000€ subito', b: 'Avere 100€ al mese per sempre' },
  { a: 'Non dover mai più studiare', b: 'Non dover mai più lavorare' },
  { a: 'Viaggiare nel passato', b: 'Viaggiare nel futuro' },
  { a: 'Avere un drago come animale domestico', b: 'Avere una bacchetta magica funzionante' },
  { a: 'Mangiare gratis al ristorante per sempre', b: 'Viaggiare gratis per sempre' },
  { a: 'Essere invisibile quando vuoi', b: 'Potere leggere nel pensiero quando vuoi' },
  { a: 'Vivere in una casa sull\u2019albero hi-tech', b: 'Vivere in un castello senza internet' },
  { a: 'Sapere la data della tua morte', b: 'Sapere la causa della tua morte' },
  { a: 'Avere 10 milioni di follower fake', b: 'Avere 100 follower veri che ti adorano' },
  { a: 'Non poter più ascoltare musica', b: 'Non poter più guardare film e serie TV' },
  { a: 'Essere il migliore amico di un alieno', b: 'Essere il migliore amico di un miliardario' },
  { a: 'Rivivere lo stesso giorno felice per sempre', b: 'Vivere ogni giorno diverso con alti e bassi' },
  { a: 'Avere la batteria infinita sul telefono', b: 'Avere dati illimitati gratis per sempre' },
  { a: 'Combattere contro un\u2019anatra grande come un cavallo', b: 'Combattere contro 100 cavalli grandi come anatre' },
  { a: 'Parlare solo in rima per un mese', b: 'Muoviti solo ballando per un mese' },
  { a: 'Sapere tutti gli spoiler delle serie TV', b: 'Non poter mai più finire una serie TV' },
  { a: 'Essere ricco ma senza amici', b: 'Essere povero ma circondato da amici veri' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('preferiresti')
    .setDescription('Un dilemma impossibile: vota A o B e scopri cosa pensa il server!'),
  cooldown: 10,
  async execute(interaction) {
    const dilemma = DILEMMI[Math.floor(Math.random() * DILEMMI.length)];
    const uid = interaction.user.id;
    // customId univoci: prefisso + userId di chi ha lanciato + nonce + scelta
    const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const prefix = `preferiresti:${uid}:${nonce}`;

    const row = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${prefix}:a`).setLabel(`🅰️ ${trunc(dilemma.a, 76)}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${prefix}:b`).setLabel(`🅱️ ${trunc(dilemma.b, 76)}`.slice(0, 80)).setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🤔 Preferiresti...? — hai 60 secondi per votare!')
      .setDescription(`🅰️ **${trunc(dilemma.a, 500)}**\n\n🆚\n\n🅱️ **${trunc(dilemma.b, 500)}**\n\nVota con i bottoni qui sotto! (Puoi cambiare voto.)`)
      .setFooter({ text: `Dilemma di ${trunc(interaction.user.tag, 100)} • Possono votare tutti` })
      .setTimestamp();

    const reply = await interaction.reply({ embeds: [embed], components: [row()], withResponse: true });
    // FIX: withResponse in alcune versioni non popola resource.message → fallback fetchReply.
    const message = reply?.resource?.message ?? await interaction.fetchReply().catch(() => null);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return;

    const voti = new Map(); // userId -> 'a' | 'b'

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.customId.startsWith(prefix),
    });

    collector.on('collect', async (i) => {
      const scelta = i.customId.split(':').pop();
      if (scelta !== 'a' && scelta !== 'b') {
        // FIX: reply effimera non awaitata senza catch → crash su interaction scaduta.
        await i.reply({ content: '❌ Voto non valido.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      voti.set(i.user.id, scelta);
      const etichetta = scelta === 'a' ? dilemma.a : dilemma.b;
      // FIX: catch su double-click/race (Unknown interaction) invece di throw.
      await i.reply({
        content: `✅ Hai votato **${scelta.toUpperCase()} — ${trunc(etichetta, 150)}**. Puoi cambiare idea premendo l\u2019altro bottone!`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    });

    collector.on('end', async () => {
      const totA = [...voti.values()].filter((v) => v === 'a').length;
      const totB = [...voti.values()].filter((v) => v === 'b').length;
      const tot = totA + totB;
      const percA = tot === 0 ? 0 : Math.round((totA / tot) * 100);
      const percB = tot === 0 ? 0 : 100 - percA;
      // Barre premium da theme.js (sicure su div0), una per opzione.
      const barraA = themeBar(totA, tot);
      const barraB = themeBar(totB, tot);

      const vincitore = tot === 0 ? 'Nessun voto: il dilemma resta irrisolto! 😅' : totA === totB
        ? '🤝 Pareggio perfetto! Il dilemma divide il server a metà.'
        : totA > totB ? `🏆 Vince **A — ${dilemma.a}**!` : `🏆 Vince **B — ${dilemma.b}**!`;

      const risultati = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('📊 Risultati — Preferiresti...?')
        .setDescription(
          `🅰️ **${trunc(dilemma.a, 500)}**\n\`${barraA}\` **${percA}%** (${totA} voti)\n\n` +
          `🅱️ **${trunc(dilemma.b, 500)}**\n\`${barraB}\` **${percB}%** (${totB} voti)\n\n${vincitore}`
        )
        .setFooter({ text: `Dilemma di ${trunc(interaction.user.tag, 80)} • ${tot} voti totali` })
        .setTimestamp();

      const disabilitati = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${prefix}:a:fin`).setLabel(`🅰️ ${trunc(dilemma.a, 70)} (${totA})`.slice(0, 80)).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${prefix}:b:fin`).setLabel(`🅱️ ${trunc(dilemma.b, 70)} (${totB})`.slice(0, 80)).setStyle(ButtonStyle.Danger).setDisabled(true)
      );

      // FIX: cleanup collector + bottoni disabilitati a timeout, edit protetto se msg cancellato.
      try { collector.stop('finito'); } catch { /* ignora */ }
      await interaction.editReply({ embeds: [risultati], components: [disabilitati] }).catch(() => {});
    });
  },
};
