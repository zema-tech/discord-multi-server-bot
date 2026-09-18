const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const ms = require('ms');
const { sendLog, hierarchyAllows } = require('../../utils/helpers');
const { logCase } = require('../../database/cases');

// theme.js condiviso, con fallback inline se il require fallisse (mai nomi/opzioni diversi).
let ok, err, applyFooter, truncate;
try {
  ({ ok, err, applyFooter, truncate } = require('../../utils/theme'));
} catch {
  const { EmbedBuilder } = require('discord.js');
  ok = (t, d) => new EmbedBuilder().setColor(0x57f287).setTitle(String(t ?? '').slice(0, 256)).setDescription(String(d ?? '').slice(0, 4000)).setTimestamp();
  err = (t) => new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp();
  applyFooter = (e, i) => { try { e.setFooter({ text: `Richiesto da ${i?.user?.tag ?? i?.user?.username ?? 'Utente'}` }); } catch {} try { e.setTimestamp(); } catch {} return e; };
  truncate = (s, m) => { const str = typeof s === 'string' ? s : String(s ?? ''); const n = Math.floor(Number(m)); if (!Number.isFinite(n) || n < 0) return str; return str.length <= n ? str : str.slice(0, n); };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Mette un utente in timeout (es. 10m, 1h, 1d)')
    .addUserOption((o) => o.setName('utente').setDescription('Utente da silenziare').setRequired(true))
    .addStringOption((o) => o.setName('durata').setDescription('Durata: 30s, 10m, 1h, 1d (max 28d)').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [err('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const deny = (text) => interaction.reply({ embeds: [err(text)], flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('utente');
    const raw = interaction.options.getString('durata');
    const reason = truncate(interaction.options.getString('motivo') || 'Nessun motivo specificato', 1024);
    let duration;
    try {
      duration = ms(String(raw ?? '').slice(0, 100));
    } catch {
      duration = undefined;
    }

    if (!duration || duration < 5000 || duration > 28 * 24 * 3600 * 1000) {
      return deny('Durata non valida. Usa formati come `30s`, `10m`, `2h`, `1d` (min 5s, max 28g).');
    }
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return deny('Utente non nel server.');
    if (user.id === interaction.user.id)
      return deny('Non puoi silenziare te stesso!');
    if (user.id === interaction.client.user.id)
      return deny('Non puoi silenziare me!');
    if (user.bot)
      return deny('Non puoi mettere in timeout un bot.');
    if (member.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId)
      return deny('Non puoi silenziare il proprietario del server.');
    if (!member.moderatable)
      return deny('Non posso moderare questo utente (permessi miei o gerarchia ruoli insufficienti).');
    if (!hierarchyAllows(interaction, member))
      return deny('Ruolo uguale/superiore al tuo.');

    try {
      await member.timeout(duration, truncate(`${reason} | Mod: ${interaction.user.tag ?? interaction.user.username}`, 512));
      // Best-effort: DM chiuso = errore ignorato, mai bloccare il comando.
      await user.send(`⏱️ Sei stato messo in timeout in **${interaction.guild.name}** per **${truncate(raw, 100)}**.\nMotivo: ${reason}`).catch(() => {});
      try { logCase(interaction.guild.id, { type: 'timeout', userId: user.id, modId: interaction.user.id, reason, meta: { durata: raw } }); } catch {}
      const tag = user.tag ?? user.username;
      const embed = applyFooter(
        ok('⏱️ Timeout applicato', `**Utente:** ${tag} (${user})\n**Durata:** ${truncate(raw, 100)}\n**Motivo:** ${reason}`),
        interaction
      );
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch (e) {
      console.error(e);
      const payload = { embeds: [err('Errore timeout: verifica i miei permessi (Modera Membri) e la gerarchia ruoli.')], flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
