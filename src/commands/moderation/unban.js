const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { sendLog } = require('../../utils/helpers');
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
    .setName('unban')
    .setDescription('Sbanna un utente tramite ID')
    .addStringOption((o) => o.setName('userid').setDescription('ID utente da sbannare').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [err('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    const fail = (text) => {
      const payload = { embeds: [err(text)], flags: MessageFlags.Ephemeral };
      // Fix double-reply: se una reply è già partita (es. errore dopo reply), usa followUp.
      if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
      return interaction.reply(payload).catch(() => {});
    };
    const id = interaction.options.getString('userid');
    if (!/^\d{17,20}$/.test(id || '')) {
      return fail('ID non valido: deve essere un ID utente numerico (17–20 cifre).');
    }
    const reason = truncate(interaction.options.getString('motivo') || 'Nessun motivo', 512);
    try {
      const ban = await interaction.guild.bans.fetch(id).catch(() => null);
      if (!ban) {
        return fail('Utente non bannato (o ID inesistente): niente da sbannare.');
      }
      await interaction.guild.bans.remove(id, truncate(`${reason} | Mod: ${interaction.user.tag ?? interaction.user.username}`, 512));
      try { logCase(interaction.guild.id, { type: 'unban', userId: id, modId: interaction.user.id, reason }); } catch {}
      const embed = applyFooter(ok('✅ Utente sbannato', `**ID:** \`${id}\`\n**Utente:** ${ban.user?.tag ?? ban.user?.username ?? 'sconosciuto'}\n**Motivo:** ${reason}`), interaction);
      await interaction.reply({ embeds: [embed] });
      await sendLog(interaction.guild, { embeds: [embed] });
    } catch {
      await fail('Errore durante lo sbannamento: verifica i miei permessi (Banna Membri).');
    }
  },
};
