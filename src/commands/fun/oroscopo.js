const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const SEGNI = [
  { id: 'ariete', nome: 'Ariete', emoji: '♈' },
  { id: 'toro', nome: 'Toro', emoji: '♉' },
  { id: 'gemelli', nome: 'Gemelli', emoji: '♊' },
  { id: 'cancro', nome: 'Cancro', emoji: '♋' },
  { id: 'leone', nome: 'Leone', emoji: '♌' },
  { id: 'vergine', nome: 'Vergine', emoji: '♍' },
  { id: 'bilancia', nome: 'Bilancia', emoji: '♎' },
  { id: 'scorpione', nome: 'Scorpione', emoji: '♏' },
  { id: 'sagittario', nome: 'Sagittario', emoji: '♐' },
  { id: 'capricorno', nome: 'Capricorno', emoji: '♑' },
  { id: 'acquario', nome: 'Acquario', emoji: '♒' },
  { id: 'pesci', nome: 'Pesci', emoji: '♓' },
];

const FRASI_AMORE = [
  'Venere ti sorride: un incontro inatteso potrebbe scaldarti il cuore.',
  'Giornata tranquilla in amore: ascolta di più e giudica di meno.',
  'La passione è alle stelle, ma attento alle parole impulsive.',
  'Un vecchio legame torna a farsi sentire: decidi tu se riaprire la porta.',
  'Single? Guarda meglio chi ti sta già vicino: la risposta è lì.',
  'La complicità con il partner cresce: organizza qualcosa di speciale.',
  'Evita i fraintendimenti: un messaggio chiaro vale più di mille silenzi.',
  'Il cuore chiede coraggio: fai il primo passo, non te ne pentirai.',
];

const FRASI_LAVORO = [
  'Un progetto bloccato si sblocca: tieni gli occhi aperti sulle email.',
  'Buon momento per chiedere quell\u2019aumento o quel cambio di ruolo.',
  'Evita discussioni con i colleghi: oggi la diplomazia paga più del talento.',
  'Un\u2019idea apparentemente folle potrebbe rivelarsi la mossa vincente.',
  'Concentrazione alta al mattino: rimanda le riunioni noiose al pomeriggio.',
  'Qualcuno nota il tuo impegno: la meritata ricompensa si avvicina.',
  'Non firmare nulla di fretta: leggi bene le clausole in piccolo.',
  'Giornata perfetta per imparare qualcosa di nuovo e metterti in mostra.',
];

const FRASI_FORTUNA = [
  'La fortuna bussa piano: i piccoli rischi oggi sono benedetti dalle stelle.',
  'Evita il gioco d\u2019azzardo, ma osa nelle scelte che contano davvero.',
  'Un numero, un incontro, un segno: oggi le coincidenze non sono casuali.',
  'La fortuna aiuta gli audaci: esci dalla routine e qualcosa accadrà.',
  'Giornata neutra: la vera fortuna è non combinare guai.',
  'Un colpo di fortuna in arrivo nel pomeriggio: resta ricettivo.',
];

const COLORI = [
  'Rosso passione', 'Blu oceano', 'Verde smeraldo', 'Giallo sole',
  'Viola mistico', 'Arancione energia', 'Rosa tenerezza', 'Nero elegante',
  'Bianco puro', 'Azzurro cielo', 'Oro splendente', 'Argento lunare',
];

// Hash deterministico stringa -> uint32 (xfnv1a).
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// PRNG deterministico (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stelle(n) {
  return '⭐'.repeat(n) + '☆'.repeat(5 - n);
}

// Generatore puro e deterministico: stesso segno + stessa data = stesso output.
// dateStr formato 'YYYY-MM-DD'. Esportato per i test.
function generaOroscopo(segnoId, dateStr) {
  const rng = mulberry32(hashStr(`${segnoId}|${dateStr}`));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const voto = () => 1 + Math.floor(rng() * 5);
  return {
    amore: voto(),
    lavoro: voto(),
    fortuna: voto(),
    fraseAmore: pick(FRASI_AMORE),
    fraseLavoro: pick(FRASI_LAVORO),
    fraseFortuna: pick(FRASI_FORTUNA),
    numero: 1 + Math.floor(rng() * 99),
    colore: pick(COLORI),
  };
}

function dataLocale(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('oroscopo')
    .setDescription('Scopri il tuo oroscopo di oggi: amore, lavoro e fortuna!')
    .addStringOption((option) =>
      option
        .setName('segno')
        .setDescription('Il tuo segno zodiacale')
        .setRequired(true)
        .addChoices(...SEGNI.map((s) => ({ name: `${s.emoji} ${s.nome}`, value: s.id })))
    ),
  cooldown: 3,
  generaOroscopo,
  async execute(interaction) {
    const segnoId = interaction.options.getString('segno');
    const segno = SEGNI.find((s) => s.id === segnoId) || SEGNI[0];
    const oggi = dataLocale();
    const o = generaOroscopo(segno.id, oggi);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`${segno.emoji} Oroscopo di ${segno.nome} — oggi`)
      .addFields(
        { name: `❤️ Amore ${stelle(o.amore)}`, value: o.fraseAmore },
        { name: `💼 Lavoro ${stelle(o.lavoro)}`, value: o.fraseLavoro },
        { name: `🍀 Fortuna ${stelle(o.fortuna)}`, value: o.fraseFortuna },
        { name: '🔢 Numero fortunato', value: String(o.numero), inline: true },
        { name: '🎨 Colore fortunato', value: o.colore, inline: true }
      )
      .setFooter({ text: `Oroscopo del ${oggi} • Richiesto da ${interaction.user.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
