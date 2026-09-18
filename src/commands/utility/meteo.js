const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
let T;
try {
  T = require('../../utils/theme');
} catch {
  T = {
    COLORS: { blue: 0x3498db },
    truncate: (s, m) => String(s ?? '').slice(0, m),
  };
}

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 10000;

// Mappa WMO weathercode -> { emoji, descrizione }
function weatherInfo(code) {
  const c = Number(code);
  if (c === 0) return { emoji: '☀️', label: 'Sereno' };
  if (c === 1) return { emoji: '🌤️', label: 'Prevalentemente sereno' };
  if (c === 2) return { emoji: '⛅', label: 'Parzialmente nuvoloso' };
  if (c === 3) return { emoji: '☁️', label: 'Nuvoloso' };
  if (c === 45 || c === 48) return { emoji: '🌫️', label: 'Nebbia' };
  if (c === 51 || c === 53 || c === 55) return { emoji: '🌦️', label: 'Pioviggine' };
  if (c === 56 || c === 57) return { emoji: '🌧️', label: 'Pioviggine gelata' };
  if (c === 61 || c === 63 || c === 65) return { emoji: '🌧️', label: 'Pioggia' };
  if (c === 66 || c === 67) return { emoji: '🌧️❄️', label: 'Pioggia gelata' };
  if (c === 71 || c === 73 || c === 75 || c === 77) return { emoji: '❄️', label: 'Neve' };
  if (c === 80 || c === 81 || c === 82) return { emoji: '🌧️', label: 'Rovesci' };
  if (c === 85 || c === 86) return { emoji: '🌨️', label: 'Rovesci di neve' };
  if (c === 95) return { emoji: '⛈️', label: 'Temporale' };
  if (c === 96 || c === 99) return { emoji: '⛈️🧊', label: 'Temporale con grandine' };
  return { emoji: '🌡️', label: 'Condizione sconosciuta' };
}

function weatherEmoji(code) {
  return weatherInfo(code).emoji;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  // Esportata per test: mapping weathercode -> emoji
  weatherEmoji,
  weatherInfo,
  data: new SlashCommandBuilder()
    .setName('meteo')
    .setDescription('Mostra il meteo di una città (Open-Meteo, gratis)')
    .addStringOption((o) =>
      o.setName('citta').setDescription('Nome della città (es. Roma)').setRequired(true).setMaxLength(100),
    )
    .addIntegerOption((o) =>
      o.setName('giorni').setDescription('Giorni di previsione (1-7)').setRequired(false).setMinValue(1).setMaxValue(7),
    ),
  cooldown: 10,
  async execute(interaction) {
    const rawCitta = interaction.options.getString('citta', true);
    // Sanitizza: niente newline che romperebbero l'embed / menzioni multilinea.
    const citta = String(rawCitta || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    const giorni = interaction.options.getInteger('giorni') ?? 2;

    if (!citta) {
      await interaction.reply({ content: '❌ Inserisci il nome di una città (es. `/meteo citta:Roma`).', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let geo;
    try {
      const url = `${GEO_URL}?name=${encodeURIComponent(citta)}&count=1&language=it&format=json`;
      geo = await fetchJson(url);
    } catch {
      await interaction.editReply('❌ Servizio meteo non raggiungibile. Riprova tra qualche minuto.');
      return;
    }

    const place = geo && geo.results && geo.results[0];
    if (!place) {
      const safe = T.truncate(citta, 100).replace(/[*_`~@]/g, '');
      await interaction.editReply(`❌ Città **${safe}** non trovata. Controlla l'ortografia e riprova (es. \`/meteo citta:Milano\`).`);
      return;
    }

    let fc;
    try {
      const url =
        `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max' +
        '&timezone=auto&forecast_days=' +
        encodeURIComponent(String(giorni));
      fc = await fetchJson(url);
    } catch {
      await interaction.editReply('❌ Previsioni non disponibili al momento. Riprova tra qualche minuto.');
      return;
    }

    try {
      const daily = fc && fc.daily;
      if (!daily || !daily.time || !daily.time.length) throw new Error('daily vuoto');

      const nome = T.truncate([place.name, place.admin1, place.country].filter(Boolean).join(', '), 200) || T.truncate(citta, 100);
      const embed = new EmbedBuilder()
        .setColor(T.COLORS.blue ?? 0x38bdf8)
        .setTitle(T.truncate(`🌤️ Meteo: ${nome}`, 256))
        .setDescription(T.truncate(`📍 **${nome}** • 🔭 previsione **${daily.time.length} giorni**`, 4000))
        .setFooter({ text: T.truncate('Dati gratuiti: Open-Meteo (senza chiave API)', 200) })
        .setTimestamp();

      for (let i = 0; i < daily.time.length; i += 1) {
        const info = weatherInfo(daily.time && daily.weathercode ? daily.weathercode[i] : undefined);
        let data;
        try {
          data = new Date(`${daily.time[i]}T12:00:00`).toLocaleDateString('it-IT', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });
        } catch {
          data = String(daily.time[i]);
        }
        // ?? (non ||): risposte parziali con null non devono stampare "null"/"undefined".
        const tmax = daily.temperature_2m_max?.[i] ?? '?';
        const tmin = daily.temperature_2m_min?.[i] ?? '?';
        const pp =
          daily.precipitation_probability_max?.[i] != null
            ? `${daily.precipitation_probability_max[i]}%`
            : '—';
        embed.addFields({
          name: T.truncate(`${info.emoji} ${data} — ${info.label}`, 256),
          value: T.truncate(`🌡️ ${tmin}° / **${tmax}°C** · 🌧️ pioggia: ${pp}`, 1024),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Dati meteo non validi ricevuti. Riprova più tardi.');
    }
  },
};
