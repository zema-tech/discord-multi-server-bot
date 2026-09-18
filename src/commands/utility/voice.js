const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getTemp } = require('../../database/tempvoice');
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  const { EmbedBuilder: EB } = require('discord.js');
  theme = {
    ok: (t, d) => new EB().setColor(0x57f287).setTitle(String(t).slice(0, 256)).setDescription(String(d).slice(0, 4000)).setTimestamp(),
    err: (t) => new EB().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t).slice(0, 4000)).setTimestamp(),
  };
}

function isStaff(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
}

async function resolveTempChannel(interaction) {
  const fail = (text) => interaction.reply({ embeds: [theme.err(text)], flags: MessageFlags.Ephemeral });
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    await fail('Devi essere dentro la tua **vocale temporanea** per usare questo comando.');
    return null;
  }
  // FIX owner: ricontrolla il canale live (quello in cache può essere eliminato/rinominato)
  // e valida il record temp: ownerId mancante o canale non più registrato → nega con messaggio chiaro
  // invece di lasciare passare/fallire in modo ambiguo.
  const live = await interaction.guild.channels.fetch(voiceChannel.id).catch(() => null);
  if (!live) {
    await fail('Questa vocale non esiste più. Creane una nuova entrando nella lobby.');
    return null;
  }
  const temp = getTemp(interaction.guild.id, live.id);
  if (!temp) {
    await fail('Questo canale non è una **vocale temporanea**.');
    return null;
  }
  if (!temp.ownerId) {
    await fail('Proprietario della vocale non registrato: chiedi allo staff di intervenire.');
    return null;
  }
  const allowed = temp.ownerId === interaction.user.id || isStaff(interaction.member);
  if (!allowed) {
    await fail('Solo il **proprietario** della vocale o lo staff può gestirla.');
    return null;
  }
  return live;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Gestisci la tua vocale temporanea')
    .addSubcommand((s) =>
      s.setName('nome').setDescription('Rinomina la tua vocale')
        .addStringOption((o) => o.setName('nome').setDescription('Nuovo nome (max 100 caratteri)').setMinLength(1).setMaxLength(100).setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('limite').setDescription('Imposta il limite di utenti (0 = nessun limite)')
        .addIntegerOption((o) => o.setName('numero').setDescription('Da 0 a 99').setMinValue(0).setMaxValue(99).setRequired(true))
    )
    .addSubcommand((s) => s.setName('blocca').setDescription('Blocca la vocale (nessun nuovo ingresso)'))
    .addSubcommand((s) => s.setName('sblocca').setDescription('Sblocca la vocale'))
    .addSubcommand((s) =>
      s.setName('kick').setDescription('Disconnetti un utente dalla vocale')
        .addUserOption((o) => o.setName('utente').setDescription('Utente da disconnettere').setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [theme.err('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const channel = await resolveTempChannel(interaction);
    if (!channel) return;

    const done = (text) => interaction.reply({ embeds: [theme.ok('🔊 Vocale temporanea', text)], flags: MessageFlags.Ephemeral });
    const fail = (text) => interaction.reply({ embeds: [theme.err(text)], flags: MessageFlags.Ephemeral });
    try {
      if (sub === 'nome') {
        const nome = interaction.options.getString('nome', true).trim().slice(0, 100);
        if (!nome) {
          return fail('Nome non valido.');
        }
        await channel.setName(nome, `Rinominata da ${interaction.user.tag}`);
        return done(`Vocale rinominata in **${nome}**.`);
      }

      if (sub === 'limite') {
        const numero = interaction.options.getInteger('numero', true);
        await channel.setUserLimit(numero, `Limite impostato da ${interaction.user.tag}`);
        return done(numero === 0 ? 'Limite **rimosso** (ingressi illimitati).' : `Limite impostato a **${numero}** utenti.`);
      }

      if (sub === 'blocca') {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone.id,
          { Connect: false },
          { reason: `Bloccata da ${interaction.user.tag}` }
        );
        return done('Vocale **bloccata** 🔒: nessuno può più entrare.');
      }

      if (sub === 'sblocca') {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone.id,
          { Connect: null },
          { reason: `Sbloccata da ${interaction.user.tag}` }
        );
        return done('Vocale **sbloccata** 🔓: tutti possono entrare.');
      }

      if (sub === 'kick') {
        const user = interaction.options.getUser('utente', true);
        if (user.id === interaction.user.id) {
          return fail('Non puoi disconnettere te stesso.');
        }
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target?.voice?.channel || target.voice.channel.id !== channel.id) {
          return fail(`${user} non è in questa vocale.`);
        }
        await target.voice.disconnect(`Espulso da ${interaction.user.tag}`);
        return done(`${user} **disconnesso** dalla vocale.`);
      }
    } catch {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ embeds: [theme.err('Verifica i miei permessi sul canale vocale.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return interaction.reply({ embeds: [theme.err('Verifica i miei permessi sul canale vocale.')], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
};
