const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}
const COLORS = theme?.COLORS ?? { primary: 0x5865f2, success: 0x57f287, error: 0xed4245 };
const themeErr = theme?.err ?? ((t) =>
  new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription(String(t ?? '').slice(0, 4000)).setTimestamp()
);
const truncate = theme?.truncate ?? ((s, m) => String(s ?? '').slice(0, m));

function client() {
  return require('../../mcp/client');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mcp')
    .setDescription('Connessioni MCP esterne del bot (stile Hermes)')
    .addSubcommand((s) => s.setName('stato').setDescription('Server MCP connessi / falliti / tool registrati'))
    .addSubcommand((s) => s.setName('lista').setDescription('Tool disponibili in questo server (mcp_<server>_<tool>)'))
    .addSubcommand((s) =>
      s.setName('cerca').setDescription('Cerca un tool tra i server connessi (stile Composio)')
        .addStringOption((o) => o.setName('query').setDescription('Parole chiave (es. "github issue")').setRequired(true).setMaxLength(200))
    )
    .addSubcommand((s) =>
      s.setName('chiama').setDescription('Chiama un tool MCP esterno')
        .addStringOption((o) => o.setName('nome').setDescription('Nome tool (mcp_server_tool)').setRequired(true).setMaxLength(120))
        .addStringOption((o) => o.setName('argomenti').setDescription('Argomenti JSON (es. {"path":"."}))').setRequired(false).setMaxLength(2000))
    )
    .addSubcommand((s) => s.setName('ricarica').setDescription('Rileggi mcp/servers.json senza riavviare'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  cooldown: 5,
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ embeds: [themeErr('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [themeErr('Serve il permesso Amministratore.')], flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const c = client();
    const gid = interaction.guild.id; // scope: i server con guilds:[...] filtrano qui

    if (sub === 'stato') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let sum;
      try {
        sum = await c.status();
      } catch (e) {
        return interaction.editReply({ embeds: [themeErr(e?.message || 'Stato MCP fallito.')] });
      }
      const lines = (sum.status || []).map((s) =>
        `${s.status === 'connected' ? '🟢' : s.status === 'disabled' ? '⚪' : '🔴'} \`${s.name}\` (${s.transport}) — ${s.tools} tool` +
        (s.guilds ? ` · solo ${s.guilds.length} server` : '') +
        (s.error ? ` — ${truncate(s.error, 120)}` : '')
      );
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🔌 MCP client — ${sum.connected}/${sum.servers} connessi, ${sum.tools} tool`)
        .setDescription(truncate(
          (lines.length ? lines.join('\n') : 'Nessun server configurato. Copia `mcp/servers.example.json` in `mcp/servers.json`.') +
          (sum.warnings && sum.warnings.length ? `\n\n⚠️ ${sum.warnings.slice(0, 3).join('\n⚠️ ')}` : ''),
          4000
        ))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] }).catch(() => null);
    }

    if (sub === 'lista') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let defs;
      try {
        defs = await c.listTools({ guildId: gid });
      } catch (e) {
        return interaction.editReply({ embeds: [themeErr(e?.message || 'Lista MCP fallita.')] });
      }
      if (!defs.length) {
        return interaction.editReply({ content: '🔌 Nessun tool MCP per questo server. Configura `mcp/servers.json` poi `/mcp ricarica`.' }).catch(() => null);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🔌 Tool MCP (${defs.length})`)
        .setDescription(truncate(defs.slice(0, 25).map((d) => `\`${d.name}\` — ${truncate(d.description || '', 90)}`).join('\n'), 4000))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] }).catch(() => null);
    }

    if (sub === 'cerca') {
      const query = interaction.options.getString('query', true).trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let hits;
      try {
        hits = await c.searchTools(query, { guildId: gid });
      } catch (e) {
        return interaction.editReply({ embeds: [themeErr(e?.message || 'Ricerca MCP fallita.')] });
      }
      if (!hits.length) {
        return interaction.editReply({ content: `🔍 Niente per "${query}". Prova con altre parole o \`/mcp lista\`.` }).catch(() => null);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🔍 MCP: ${hits.length} per "${truncate(query, 60)}"`)
        .setDescription(truncate(hits.map((h) => `\`${h.name}\` (\`${h.server}\`) — ${truncate(h.description || '', 80)}`).join('\n'), 4000))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] }).catch(() => null);
    }

    if (sub === 'chiama') {
      const nome = interaction.options.getString('nome', true).trim();
      const rawArgs = (interaction.options.getString('argomenti') || '{}').trim();
      let args = {};
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        return interaction.reply({ embeds: [themeErr('Argomenti non è JSON valido.')], flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const out = await c.callTool(nome, args, { guildId: gid });
        return interaction.editReply({ content: truncate(`✅ \`${nome}\` via \`${out.server}\`:\n\`\`\`\n${out.text || '(vuoto)'}\n\`\`\``, 1900) }).catch(() => null);
      } catch (e) {
        return interaction.editReply({ embeds: [themeErr(e?.message || 'Chiamata MCP fallita.')] });
      }
    }

    // ricarica
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const sum = await c.reload();
      return interaction.editReply({ content: `🔄 MCP ricaricato: **${sum.connected}/${sum.servers}** connessi, **${sum.tools}** tool.` }).catch(() => null);
    } catch (e) {
      return interaction.editReply({ embeds: [themeErr(e?.message || 'Ricarica MCP fallita.')] });
    }
  },
};
