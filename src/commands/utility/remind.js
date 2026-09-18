const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const ms = require('ms');

// theme.js condiviso (fallback inline se il require fallisse).
let theme;
try {
  theme = require('../../utils/theme');
} catch {
  theme = {
    COLORS: { primary: 0x5865f2, success: 0x57f287, error: 0xed4245, warn: 0xfee75c },
    ok: (t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    err: (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp(),
    info: (t, d, c = 0x5865f2) => new EmbedBuilder().setColor(c ?? 0x5865f2).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp(),
    applyFooter: (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; },
    truncate: (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); const n = Math.floor(Number(m)); if (!Number.isFinite(n) || n < 0) return str; return str.length <= n ? str : str.slice(0, n); },
  };
}
const { COLORS, ok, err, info, applyFooter, truncate } = theme;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Imposta un promemoria (es. 10m, 2h, 1d)')
    .addStringOption((o) => o.setName('tempo').setDescription('Tra quanto: 10m, 2h, 1d (max 7g)').setRequired(true))
    .addStringOption((o) => o.setName('testo').setDescription('Cosa devo ricordarti').setRequired(true))
    .addChannelOption((o) => o.setName('canale').setDescription('Canale dove pubblicare (default: DM)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const raw = interaction.options.getString('tempo');
    // Reply e send hanno limite 2000 char: l'opzione slash ne ammette fino a 6000.
    const text = String(interaction.options.getString('testo') || '').slice(0, 1500);
    const target = interaction.options.getChannel('canale') ?? null;
    const delay = ms(raw);
    if (!delay || delay < 5000 || delay > 7 * 24 * 3600 * 1000) {
      const e = applyFooter(err('Tempo non valido (min 5s, max 7g). Esempi: `10m`, `2h`, `1d`.'), interaction);
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    // Se richiesto un canale: valida che esista, sia testuale e che il bot possa scriverci.
    if (target) {
      if (!interaction.guild) {
        const e = applyFooter(err('Per pubblicare in un canale usa il comando dentro un server.'), interaction);
        return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
      }
      const ch = await interaction.guild.channels.fetch(target.id).catch(() => null);
      if (!ch || !ch.isTextBased()) {
        const e = applyFooter(err('Il canale scelto non è un canale testuale valido.'), interaction);
        return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
      }
      const me = interaction.guild.members.me;
      const perms = ch.permissionsFor(me);
      if (!perms || !perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
        const e = applyFooter(err(`Non ho i permessi per scrivere in ${ch}.`), interaction);
        return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
      }

      const when = Math.floor((Date.now() + delay) / 1000);
      const confirm = applyFooter(ok('⏰ Promemoria impostato!', `Pubblicherò il promemoria in ${ch} <t:${when}:R>.`), interaction);
      await interaction.reply({ embeds: [confirm], flags: MessageFlags.Ephemeral });
      // Il timer deve sopravvivere finché il processo resta attivo: nessuna chiamata che lo scolleghi.
      setTimeout(() => {
        const embed = applyFooter(info('⏰ Promemoria', truncate(`**${text}**`, 4000), COLORS.warn), interaction);
        ch.send({ content: `⏰ ${interaction.user}`, embeds: [embed] }).catch(() => {
          interaction.followUp({ embeds: [applyFooter(err(`Promemoria: **${truncate(text, 1500)}** (non sono riuscito a scrivere in ${ch})`), interaction)], flags: MessageFlags.Ephemeral }).catch(() => {});
        });
      }, delay);
      return;
    }

    const when = Math.floor((Date.now() + delay) / 1000);
    const dmEmbed = applyFooter(ok('⏰ Promemoria impostato!', `📝 **${truncate(text, 1500)}**\n\n🔔 Ti avviserò <t:${when}:R> in DM.`), interaction);
    await interaction.reply({ embeds: [dmEmbed], flags: MessageFlags.Ephemeral });
    // Il timer deve sopravvivere finché il processo resta attivo: nessuna chiamata che lo scolleghi.
    setTimeout(() => {
      const guildName = truncate(interaction.guild?.name ?? 'server', 100);
      const embed = applyFooter(info('⏰ Promemoria', truncate(text, 3900), COLORS.warn), interaction);
      interaction.user.send({ content: `⏰ **Promemoria** (${guildName}):`, embeds: [embed] }).catch(() => {
        interaction.followUp({ embeds: [applyFooter(info('⏰ Promemoria', truncate(text, 3900), COLORS.warn), interaction)], flags: MessageFlags.Ephemeral }).catch(() => {});
      });
    }, delay);
  },
};
