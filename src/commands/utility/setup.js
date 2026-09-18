const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../../database/guildConfig');

// theme.js condiviso (fallback inline se il require fallisse).
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    COLORS: { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 },
    ok: (t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    err: (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EmbedBuilder().setColor(c ?? 0x5865f2).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); const n = Math.floor(Number(m)); if (!Number.isFinite(n) || n < 0) return str; return str.length <= n ? str : str.slice(0, n); },
  };
}
const { COLORS, ok, applyFooter, truncate } = theme;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura il bot per questo server')
    .addSubcommand((s) =>
      s.setName('welcome').setDescription('Canale + messaggio di benvenuto')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale benvenuto (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption((o) => o.setName('messaggio').setDescription('Usa {user} {server} {count}').setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('goodbye').setDescription('Canale di addio')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('logs').setDescription('Canale log moderazione')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('suggest').setDescription('Canale suggerimenti')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (vuoto = disattiva)').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('automod').setDescription('Attiva/disattiva automoderazione')
        .addBooleanOption((o) => o.setName('attiva').setDescription('true/false').setRequired(true))
    )
    .addSubcommand((s) => s.setName('mostra').setDescription('Mostra la configurazione attuale'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  cooldown: 3,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'mostra') {
      const c = getGuild(interaction.guild.id);
      const ch = (id) => (id ? `<#${id}>` : '—');
      // Mai esporre la config in pubblico: reply sempre ephemeral (anti-leak).
      const welcomeMsg = truncate(String(c.welcomeMessage ?? '—'), 200).replace(/`/g, "'");
      const automod = c.automod && typeof c.automod === 'object' ? c.automod : {};
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`⚙️ Configurazione — ${interaction.guild.name}`.slice(0, 256))
        .setDescription('✨ *Stato attuale dei moduli del bot*')
        .addFields(
          { name: '👋 Benvenuto', value: `${ch(c.welcomeChannelId)}\n💬 \`${welcomeMsg}\``, inline: true },
          { name: '👋 Addio / 📝 Log', value: `Addio: ${ch(c.goodbyeChannelId)}\nLog: ${ch(c.logChannelId)}`, inline: true },
          { name: '💡 Suggerimenti / 🛡️ Automod', value: `Sugg.: ${ch(c.suggestChannelId)}\nAutomod: **${automod.enabled ? '🟢 ON' : '🔴 OFF'}** (spam:${automod.antiSpam ? 'on' : 'off'} link:${automod.antiLink ? 'on' : 'off'} invite:${automod.antiInvite ? 'on' : 'off'})`, inline: true }
        )
        .setFooter({ text: 'Usa /wizard per il setup guidato passo passo'.slice(0, 200) })
        .setTimestamp();
      applyFooter(embed, interaction);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'welcome') {
      const canale = interaction.options.getChannel('canale');
      const msg = interaction.options.getString('messaggio');
      const patch = {};
      if (canale !== null) patch.welcomeChannelId = canale ? canale.id : null;
      if (msg) patch.welcomeMessage = msg.slice(0, 500);
      updateGuild(interaction.guild.id, patch);
      const e = applyFooter(ok('✅ Benvenuto aggiornato', `Canale: ${canale || 'disattivato'}${msg ? `\nMessaggio: \`${truncate(msg, 200).replace(/`/g, "'")}\`` : ''}`), interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'goodbye') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { goodbyeChannelId: canale ? canale.id : null });
      const e = applyFooter(ok('✅ Canale addio aggiornato', `Canale: ${canale || 'disattivato'}.`), interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'logs') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { logChannelId: canale ? canale.id : null });
      const e = applyFooter(ok('✅ Canale log aggiornato', `Canale: ${canale || 'disattivato'}.`), interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'suggest') {
      const canale = interaction.options.getChannel('canale');
      updateGuild(interaction.guild.id, { suggestChannelId: canale ? canale.id : null });
      const e = applyFooter(ok('✅ Canale suggerimenti aggiornato', `Canale: ${canale || 'disattivato'}.`), interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'automod') {
      const on = interaction.options.getBoolean('attiva');
      updateGuild(interaction.guild.id, { automod: { enabled: on } });
      const e = applyFooter(ok('🛡️ Automoderazione', `Stato: **${on ? 'attivata 🟢' : 'disattivata 🔴'}**`), interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }
  },
};
