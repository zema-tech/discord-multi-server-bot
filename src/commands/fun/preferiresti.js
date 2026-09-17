const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType,
} = require('discord.js');

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
      new ButtonBuilder().setCustomId(`${prefix}:a`).setLabel(`🅰️ ${dilemma.a}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${prefix}:b`).setLabel(`🅱️ ${dilemma.b}`.slice(0, 80)).setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤔 Preferiresti...? — hai 60 secondi per votare!')
      .setDescription(`🅰️ **${dilemma.a}**\n\n🆚\n\n🅱️ **${dilemma.b}**\n\nVota con i bottoni qui sotto! (Puoi cambiare voto.)`)
      .setFooter({ text: `Dilemma di ${interaction.user.tag} • Possono votare tutti` })
      .setTimestamp();

    const reply = await interaction.reply({ embeds: [embed], components: [row()], withResponse: true });
    const message = reply.resource.message;

    const voti = new Map(); // userId -> 'a' | 'b'

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.customId.startsWith(prefix),
    });

    collector.on('collect', async (i) => {
      const scelta = i.customId.split(':').pop();
      if (scelta !== 'a' && scelta !== 'b') {
        return i.reply({ content: '❌ Voto non valido.', flags: MessageFlags.Ephemeral });
      }
      voti.set(i.user.id, scelta);
      const etichetta = scelta === 'a' ? dilemma.a : dilemma.b;
      await i.reply({
        content: `✅ Hai votato **${scelta.toUpperCase()} — ${etichetta}**. Puoi cambiare idea premendo l\u2019altro bottone!`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    });

    collector.on('end', async () => {
      const totA = [...voti.values()].filter((v) => v === 'a').length;
      const totB = [...voti.values()].filter((v) => v === 'b').length;
      const tot = totA + totB;
      const percA = tot === 0 ? 0 : Math.round((totA / tot) * 100);
      const percB = tot === 0 ? 0 : 100 - percA;
      const barra = (p) => '🟩'.repeat(Math.round(p / 10)) + '⬜'.repeat(10 - Math.round(p / 10));

      const vincitore = tot === 0 ? 'Nessun voto: il dilemma resta irrisolto! 😅' : totA === totB
        ? '🤝 Pareggio perfetto! Il dilemma divide il server a metà.'
        : totA > totB ? `🏆 Vince **A — ${dilemma.a}**!` : `🏆 Vince **B — ${dilemma.b}**!`;

      const risultati = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📊 Risultati — Preferiresti...?')
        .setDescription(
          `🅰️ **${dilemma.a}**\n${barra(percA)} **${percA}%** (${totA} voti)\n\n` +
          `🅱️ **${dilemma.b}**\n${barra(percB)} **${percB}%** (${totB} voti)\n\n${vincitore}`
        )
        .setFooter({ text: `Dilemma di ${interaction.user.tag} • ${tot} voti totali` })
        .setTimestamp();

      const disabilitati = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${prefix}:a:fin`).setLabel(`🅰️ ${dilemma.a} (${totA})`.slice(0, 80)).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${prefix}:b:fin`).setLabel(`🅱️ ${dilemma.b} (${totB})`.slice(0, 80)).setStyle(ButtonStyle.Danger).setDisabled(true)
      );

      await interaction.editReply({ embeds: [risultati], components: [disabilitati] }).catch(() => {});
    });
  },
};
