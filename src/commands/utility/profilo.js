const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Theme condiviso con fallback inline se il require fallisse.
let COLORS = { primary: 0x5865f2 };
let num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('it-IT') : 'n/d');
let truncate = (s, max) => {
  const str = typeof s === 'string' ? s : String(s ?? '');
  const m = Math.floor(Number(max));
  if (!Number.isFinite(m) || m < 0) return str;
  return str.length <= m ? str : str.slice(0, m);
};
let applyFooter = (embed, interaction) => {
  try { embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}`.slice(0, 200) }); } catch {}
  try { embed.setTimestamp(); } catch {}
  return embed;
};
try {
  const theme = require('../../utils/theme');
  if (theme?.COLORS) COLORS = theme.COLORS;
  if (typeof theme?.num === 'function') num = theme.num;
  if (typeof theme?.truncate === 'function') truncate = theme.truncate;
  if (typeof theme?.applyFooter === 'function') applyFooter = theme.applyFooter;
} catch {}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profilo')
    .setDescription("Mostra il profilo completo di un utente")
    .addUserOption((o) => o.setName('utente').setDescription('Utente (default: tu)').setRequired(false)),
  cooldown: 3,
  async execute(interaction) {
    const user = interaction.options.getUser('utente') || interaction.user;
    // BUGFIX: comando usato in DM (guild null) -> risposta effimera invece di crash su guild.id.
    if (!interaction.guild) {
      const { MessageFlags } = require('discord.js');
      return interaction.reply({ content: '❌ Usa questo comando dentro un server.', flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.guild.id;
    // BUGFIX member null (utente fuori cache / non nel server): prova fetch, resta null-safe.
    let member = interaction.guild.members.cache.get(user.id) ?? null;
    if (!member) {
      try {
        member = await interaction.guild.members.fetch(user.id).catch(() => null);
      } catch {
        member = null;
      }
    }

    // Livello (levels) — BUGFIX DB null: getLevel può lanciare o tornare null.
    let livelloTxt = 'n/d';
    try {
      const { getLevel } = require('../../database/levels');
      const lv = getLevel(guildId, user.id) ?? {};
      const level = Number.isFinite(Number(lv.level)) ? Number(lv.level) : 0;
      const xp = Number.isFinite(Number(lv.xp)) ? Number(lv.xp) : 0;
      livelloTxt = `Livello **${num(level)}** (${num(xp)} XP)`;
    } catch {}

    // Saldo (economy) — BUGFIX DB null.
    let saldoTxt = 'n/d';
    try {
      const { getUser } = require('../../database/economy');
      const eco = getUser(guildId, user.id) ?? {};
      const bal = Number.isFinite(Number(eco.balance)) ? Number(eco.balance) : 0;
      const bank = Number.isFinite(Number(eco.bank)) ? Number(eco.bank) : 0;
      saldoTxt = `**${num(bal)}** 🪙 (banca: **${num(bank)}** 🪙)`;
    } catch {}

    // Rep — BUGFIX DB null.
    let repTxt = 'n/d';
    try {
      const { getRep } = require('../../database/rep');
      const rep = getRep(guildId, user.id) ?? {};
      repTxt = `**${num(rep.count ?? 0)}** ⭐`;
    } catch {}

    // Warn count (warnings getWarnings) — BUGFIX DB null.
    let warnTxt = 'n/d';
    try {
      const { getWarnings } = require('../../database/warnings');
      const warns = getWarnings(guildId, user.id);
      warnTxt = `**${num(Array.isArray(warns) ? warns.length : 0)}** ⚠️`;
    } catch {}

    // Data ingresso
    let ingressoTxt = 'n/d';
    try {
      if (member?.joinedTimestamp) ingressoTxt = `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`;
    } catch {}

    // Account creato (sempre disponibile da user, anche se member è null).
    let creatoTxt = 'n/d';
    try {
      if (user?.createdTimestamp) creatoTxt = `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`;
    } catch {}

    // Ruoli top3 (escluso @everyone)
    let ruoliTxt = 'n/d';
    try {
      if (member) {
        const roles = member.roles.cache
          .filter((r) => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .first(3)
          .map((r) => `${r}`);
        ruoliTxt = roles.length ? roles.join(' ') : 'Nessuno';
      } else {
        ruoliTxt = 'Utente non nel server';
      }
    } catch {}

    // Colore: displayHexColor '#000000' = default -> fallback primary (BUGFIX: '#000000' rendeva l'embed nero).
    let color = COLORS.primary;
    try {
      const hex = member?.displayHexColor;
      if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) && hex.toLowerCase() !== '#000000') {
        color = hex;
      }
    } catch {}
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(truncate(`✨ Profilo di ${user.tag ?? user.username ?? 'Utente'}`, 256))
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '📊 Livello', value: livelloTxt, inline: true },
        { name: '💰 Saldo', value: saldoTxt, inline: true },
        { name: '⭐ Reputazione', value: repTxt, inline: true },
        { name: '⚠️ Warn', value: warnTxt, inline: true },
        { name: '📅 Entrato nel server', value: ingressoTxt, inline: true },
        { name: '👤 Account creato', value: creatoTxt, inline: true },
        { name: '🎭 Ruoli principali', value: truncate(ruoliTxt, 1024) }
      );
    applyFooter(embed, interaction);

    await interaction.reply({ embeds: [embed] });
  },
};
