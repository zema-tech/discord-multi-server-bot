const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const store = require('../../database/statChannels');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats-canali')
    .setDescription('Canali vocali con statistiche live del server')
    .addSubcommand((s) => s.setName('attiva').setDescription('Crea i 3 canali statistica (staff)'))
    .addSubcommand((s) => s.setName('disattiva').setDescription('Elimina i canali statistica (staff)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [themeErr('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'disattiva') {
      const cfg = store.get(gid);
      store.clear(gid);
      for (const id of [cfg.membersId, cfg.onlineId, cfg.botsId]) {
        if (!id) continue;
        try {
          const ch = await interaction.guild.channels.fetch(id).catch(() => null);
          if (ch) await ch.delete('Stats-canali disattivati').catch(() => {});
        } catch {}
      }
      return interaction.reply({ content: '✅ Canali statistica eliminati.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
    if (!interaction.deferred && !interaction.replied) return;
    try {
      const mk = async (name) => interaction.guild.channels.create({
        name, type: ChannelType.GuildVoice, reason: 'Stats-canali attivati',
        permissionOverwrites: [{ id: gid, deny: ['Connect'] }],
      });
      const [m, o, b] = await Promise.all([mk('👥 Membri: …'), mk('🟢 Online: …'), mk('🤖 Bot: …')]);
      store.set(gid, { membersId: m.id, onlineId: o.id, botsId: b.id });
      try {
        await require('../../jobs/statChannelsJob').refreshOne(interaction.guild);
      } catch {}
      return interaction.editReply({ content: `✅ Creati 3 canali statistica (si aggiornano ogni 10 minuti).` }).catch(() => null);
    } catch {
      return interaction.editReply({ content: '❌ Non riesco a creare i canali: verifica i miei permessi.' }).catch(() => null);
    }
  },
};
