const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getTemp } = require('../../database/tempvoice');

function isStaff(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
}

async function resolveTempChannel(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: '❌ Devi essere dentro la tua **vocale temporanea** per usare questo comando.', flags: MessageFlags.Ephemeral });
    return null;
  }
  const temp = getTemp(interaction.guild.id, voiceChannel.id);
  if (!temp) {
    await interaction.reply({ content: '❌ Questo canale non è una **vocale temporanea**.', flags: MessageFlags.Ephemeral });
    return null;
  }
  const allowed = temp.ownerId === interaction.user.id || isStaff(interaction.member);
  if (!allowed) {
    await interaction.reply({ content: '❌ Solo il **proprietario** della vocale o lo staff può gestirla.', flags: MessageFlags.Ephemeral });
    return null;
  }
  return voiceChannel;
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
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const channel = await resolveTempChannel(interaction);
    if (!channel) return;

    try {
      if (sub === 'nome') {
        const nome = interaction.options.getString('nome', true).trim().slice(0, 100);
        await channel.setName(nome, `Rinominata da ${interaction.user.tag}`);
        return interaction.reply({ content: `✅ Vocale rinominata in **${nome}**.`, flags: MessageFlags.Ephemeral });
      }

      if (sub === 'limite') {
        const numero = interaction.options.getInteger('numero', true);
        await channel.setUserLimit(numero, `Limite impostato da ${interaction.user.tag}`);
        return interaction.reply({
          content: numero === 0 ? '✅ Limite **rimosso** (ingressi illimitati).' : `✅ Limite impostato a **${numero}** utenti.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'blocca') {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone.id,
          { Connect: false },
          { reason: `Bloccata da ${interaction.user.tag}` }
        );
        return interaction.reply({ content: '🔒 Vocale **bloccata**: nessuno può più entrare.', flags: MessageFlags.Ephemeral });
      }

      if (sub === 'sblocca') {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone.id,
          { Connect: null },
          { reason: `Sbloccata da ${interaction.user.tag}` }
        );
        return interaction.reply({ content: '🔓 Vocale **sbloccata**: tutti possono entrare.', flags: MessageFlags.Ephemeral });
      }

      if (sub === 'kick') {
        const user = interaction.options.getUser('utente', true);
        if (user.id === interaction.user.id) {
          return interaction.reply({ content: '❌ Non puoi disconnettere te stesso.', flags: MessageFlags.Ephemeral });
        }
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!target?.voice?.channel || target.voice.channel.id !== channel.id) {
          return interaction.reply({ content: `❌ ${user} non è in questa vocale.`, flags: MessageFlags.Ephemeral });
        }
        await target.voice.disconnect(`Espulso da ${interaction.user.tag}`);
        return interaction.reply({ content: `✅ ${user} **disconnesso** dalla vocale.`, flags: MessageFlags.Ephemeral });
      }
    } catch {
      return interaction.reply({ content: '❌ Errore: verifica i miei permessi sul canale vocale.', flags: MessageFlags.Ephemeral });
    }
  },
};
