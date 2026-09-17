const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType } = require('discord.js');

const LETTERE = ['🇦', '🇧', '🇨', '🇩'];

// ~15 domande IT a tema generale / gaming / tech
const DOMANDE = [
  { q: 'Cosa significa "CPU"?', risposte: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility'], corretta: 0 },
  { q: 'Quale azienda ha creato Minecraft?', risposte: ['Epic Games', 'Mojang', 'Valve', 'Ubisoft'], corretta: 1 },
  { q: 'In JavaScript, cosa restituisce `typeof []`?', risposte: ['"array"', '"list"', '"object"', '"undefined"'], corretta: 2 },
  { q: 'Quale fra questi NON è un linguaggio di programmazione?', risposte: ['Python', 'Rust', 'HTML', 'Go'], corretta: 2 },
  { q: 'La GPU serve principalmente per…', risposte: ['Alimentare il PC', 'Elaborazione grafica e parallela', 'Raffreddare la CPU', 'Memorizzare i file'], corretta: 1 },
  { q: 'Quale console è uscita per prima?', risposte: ['PlayStation 2', 'GameCube', 'Dreamcast', 'Xbox'], corretta: 2 },
  { q: 'Cosa significa "HTTP"?', risposte: ['HyperText Transfer Protocol', 'High Transfer Text Process', 'Hyperlink Text Transmission Program', 'Host Transfer Text Protocol'], corretta: 0 },
  { q: 'Chi è il protagonista di "The Legend of Zelda"?', risposte: ['Zelda', 'Ganon', 'Link', 'Epona'], corretta: 2 },
  { q: 'Quanti bit ci sono in un byte?', risposte: ['4', '16', '8', '32'], corretta: 2 },
  { q: 'Quale comando installa un pacchetto con npm?', risposte: ['npm run pacchetto', 'npm install pacchetto', 'npm get pacchetto', 'npm add-server pacchetto'], corretta: 1 },
  { q: 'In Pokémon, quale tipo è superefficace contro Acqua?', risposte: ['Fuoco', 'Terra', 'Elettro', 'Ghiaccio'], corretta: 2 },
  { q: 'Cosa fa `git commit`?', risposte: ['Scarica il repository', 'Salva uno snapshot nel repository locale', 'Invia il codice su GitHub', 'Crea un nuovo branch'], corretta: 1 },
  { q: 'Quale di questi è un motore di gioco?', risposte: ['Unreal Engine', 'Photoshop', 'Blender Render', 'Discord.js'], corretta: 0 },
  { q: 'Il "phishing" è…', risposte: ['Una tecnica di pesca nei videogiochi', 'Un attacco che ruba credenziali con inganni', 'Un tipo di firewall', 'Un protocollo di rete'], corretta: 1 },
  { q: 'Quale tasto si usa spesso per "scattare" gli screenshot su Windows?', risposte: ['Stamp / R Sist', 'Bloc Num', 'Pausa', 'Fine'], corretta: 0 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Quiz a scelta multipla: indovina la risposta entro 20 secondi!'),
  cooldown: 10,
  async execute(interaction) {
    const domanda = DOMANDE[Math.floor(Math.random() * DOMANDE.length)];
    const uid = interaction.user.id;
    // customId univoci per messaggio: prefisso + userId + timestamp + indice risposta
    const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const prefix = `trivia:${uid}:${nonce}`;

    const row = new ActionRowBuilder();
    domanda.risposte.forEach((testo, i) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${prefix}:${i}`)
          .setLabel(`${'ABCD'[i]}. ${testo}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setEmoji(LETTERE[i])
      );
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🧠 Trivia — hai 20 secondi!')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(`**${domanda.q}**\n\n${domanda.risposte.map((r, i) => `${LETTERE[i]} **${'ABCD'[i]}** — ${r}`).join('\n')}`)
      .addFields({ name: '🏆 Punteggio', value: 'Risposta corretta = **+1 punto** • sbagliata/scaduta = **0 punti**', inline: false })
      .setFooter({ text: `Sfida di ${interaction.user.tag} • Rispondi con i bottoni` })
      .setTimestamp();

    const reply = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
    const message = reply.resource.message;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 20_000,
      filter: (i) => i.customId.startsWith(prefix),
    });

    let haRisposto = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== uid) {
        return i.reply({ content: '❌ Questa partita è di un altro utente! Usa `/trivia` per la tua.', flags: MessageFlags.Ephemeral });
      }
      if (haRisposto) {
        return i.reply({ content: '⏳ Hai già risposto a questa domanda.', flags: MessageFlags.Ephemeral });
      }
      haRisposto = true;
      const scelta = Number(i.customId.split(':').pop());
      const vittoria = scelta === domanda.corretta;

      const disabilitati = new ActionRowBuilder();
      domanda.risposte.forEach((testo, idx) => {
        let style = ButtonStyle.Secondary;
        if (idx === domanda.corretta) style = ButtonStyle.Success;
        else if (idx === scelta) style = ButtonStyle.Danger;
        disabilitati.addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}:${idx}:fin`)
            .setLabel(`${'ABCD'[idx]}. ${testo}`.slice(0, 80))
            .setStyle(style)
            .setEmoji(LETTERE[idx])
            .setDisabled(true)
        );
      });

      const esito = new EmbedBuilder()
        .setColor(vittoria ? 0x57f287 : 0xed4245)
        .setTitle(vittoria ? '🎉 Risposta corretta! +1 punto' : '❌ Risposta sbagliata! 0 punti')
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(`**${domanda.q}**`)
        .addFields(
          { name: '🫵 La tua risposta', value: `${LETTERE[scelta] || '❔'} **${'ABCD'[scelta] || '?'}** — ${domanda.risposte[scelta] || '*non valida*'}`, inline: false },
          { name: '✅ Risposta giusta', value: `${LETTERE[domanda.corretta]} **${'ABCD'[domanda.corretta]}** — ${domanda.risposte[domanda.corretta]}`, inline: false },
          { name: '🏆 Punteggio round', value: vittoria ? '**+1 punto** — cervellone! 🧠' : '**0 punti** — ritenta con `/trivia`! 💔', inline: false }
        )
        .setFooter({ text: `Giocatore: ${interaction.user.tag}` })
        .setTimestamp();

      await i.update({ embeds: [esito], components: [disabilitati] });
      await i.followUp({
        content: vittoria ? '🏆 **Hai vinto! (+1 punto)** Complimenti, cervellone!' : '💔 **Hai perso! (0 punti)** Ritenta con `/trivia`.',
        flags: MessageFlags.Ephemeral,
      });
      collector.stop('risposto');
    });

    collector.on('end', async (_collected, reason) => {
      if (haRisposto || reason === 'risposto') return;
      const disabilitati = new ActionRowBuilder();
      domanda.risposte.forEach((testo, idx) => {
        disabilitati.addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}:${idx}:fin`)
            .setLabel(`${'ABCD'[idx]}. ${testo}`.slice(0, 80))
            .setStyle(idx === domanda.corretta ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(LETTERE[idx])
            .setDisabled(true)
        );
      });
      const scaduto = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('⏰ Tempo scaduto! 0 punti')
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(`**${domanda.q}**`)
        .addFields(
          { name: '✅ Risposta giusta', value: `${LETTERE[domanda.corretta]} **${'ABCD'[domanda.corretta]}** — ${domanda.risposte[domanda.corretta]}`, inline: false },
          { name: '🏆 Punteggio round', value: '**0 punti** — riprova con `/trivia`!', inline: false }
        )
        .setFooter({ text: `Giocatore: ${interaction.user.tag}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [scaduto], components: [disabilitati] }).catch(() => {});
    });
  },
};
