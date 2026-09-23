const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

let theme = null;
try {
  theme = require('../../utils/theme');
} catch {
  theme = null;
}

function hasManageGuild(interaction) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  try {
    return Boolean(perms?.has(PermissionFlagsBits.ManageGuild));
  } catch {
    return false;
  }
}

function err(text) {
  if (theme?.err) return theme.err(text);
  return new EmbedBuilder().setColor(0xed4245).setTitle('❌ Errore').setDescription(String(text).slice(0, 4000)).setTimestamp();
}

function ok(title, description) {
  if (theme?.ok) return theme.ok(title, description);
  return new EmbedBuilder().setColor(0x57f287).setTitle(String(title).slice(0, 256)).setDescription(String(description).slice(0, 4000)).setTimestamp();
}

function info(title, description) {
  if (theme?.info) return theme.info(title, description);
  return new EmbedBuilder().setColor(0x5865f2).setTitle(String(title).slice(0, 256)).setDescription(String(description).slice(0, 4000)).setTimestamp();
}

function withFooter(embed, interaction) {
  try {
    if (theme?.applyFooter) theme.applyFooter(embed, interaction);
    else embed.setFooter({ text: `Richiesto da ${interaction?.user?.tag ?? 'Utente'}`.slice(0, 200) });
  } catch {}
  return embed;
}

function statusIcon(entry) {
  if (!entry.enabled) return '⏸️';
  if (entry.isolated) return '🛡️';
  if (!entry.ok) return '⚠️';
  if (entry.locked) return '🔒';
  return '✅';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modulo')
    .setDescription('Commander: stato, on/off e reload dei moduli (un guasto non spegne il resto)')
    .addSubcommand((s) => s.setName('stato').setDescription('Mostra salute di tutti i moduli'))
    .addSubcommand((s) =>
      s.setName('on').setDescription('Riattiva un modulo in questo server')
        .addStringOption((o) => o.setName('nome').setDescription('ID modulo (es. economy)').setRequired(true).setMaxLength(32))
    )
    .addSubcommand((s) =>
      s.setName('off').setDescription('Disattiva un modulo in questo server')
        .addStringOption((o) => o.setName('nome').setDescription('ID modulo (es. music)').setRequired(true).setMaxLength(32))
    )
    .addSubcommand((s) =>
      s.setName('reload').setDescription('Ricarica un modulo senza restartare il bot')
        .addStringOption((o) => o.setName('nome').setDescription('ID modulo (es. economy)').setRequired(true).setMaxLength(32))
    ),
  cooldown: 3,
  async execute(interaction) {
    const registry = require('../../modules/registry');
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild?.id || null;

    if (sub === 'stato') {
      const list = registry.health(guildId);
      const righe = list.map((m) => {
        const flag = statusIcon(m);
        const extra = m.isolated ? ' · 🛡️ protezione' : (!m.enabled ? ' · spento' : (m.errors?.length ? ` · ${m.errors[0].count}x` : ''));
        return `${flag} \`${m.id}\` (${m.commands})${extra}`;
      }).join('\n');
      const protetti = list.filter((m) => m.isolated).length;
      const spenti = list.filter((m) => !m.enabled).length;
      const desc = `**${list.length} moduli** · 🛡️ ${protetti} in protezione · ⏸️ ${spenti} spenti\n\n${righe}\n\n💡 Un modulo rotto viene isolato da solo: il resto resta attivo.`;
      return interaction.reply({ embeds: [withFooter(info('🧩 Commander — stato moduli', desc.slice(0, 4000)), interaction)], flags: guildId ? undefined : MessageFlags.Ephemeral }).catch(() => null);
    }

    // on/off/reload: solo staff con Gestisci Server, solo dentro un server.
    if (!interaction.guild) {
      return interaction.reply({ embeds: [err('Usa questo comando dentro un server.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    if (!hasManageGuild(interaction)) {
      return interaction.reply({ embeds: [err('Ti serve il permesso **Gestisci Server**.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    const nome = String(interaction.options.getString('nome') || '').toLowerCase().trim();
    if (!registry.ids().includes(nome)) {
      return interaction.reply({ embeds: [err(`Modulo sconosciuto \`${nome}\`. Usa \`/modulo stato\` per la lista.`)], flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    if (sub === 'on' || sub === 'off') {
      const enable = sub === 'on';
      try {
        registry.setEnabled(guildId, nome, enable);
      } catch (e) {
        return interaction.reply({ embeds: [err(e?.message || 'Toggle fallito.')], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      const entry = (registry.health(guildId) || []).find((h) => h.id === nome);
      const stato = enable ? 'riattivato ✅' : 'disattivato ⏸️';
      return interaction.reply({ embeds: [withFooter(ok(`Modulo ${nome} ${stato}`, `${entry?.title || nome} — ${entry?.description || ''}\nComandi: ${entry?.commands ?? '?'} · Errori azzerati, protezione rimossa.`.slice(0, 4000)), interaction)] }).catch(() => null);
    }

    if (sub === 'reload') {
      // Reload senza restart: invalida la cache del registry + ricarica il
      // file del modulo per validarne la sintassi. I comandi restano quelli
      // già caricati in memoria (hot-swap completo = restart); qui si
      // verifica che il modulo sia sano e si azzerano errori/protezione.
      try {
        const path = require('path');
        const fs = require('fs');
        const modFile = path.join(__dirname, '..', '..', 'modules', `${nome}.js`);
        if (fs.existsSync(modFile)) {
          delete require.cache[require.resolve(modFile)];
          require(modFile); // lancia se sintassi rotta -> catch sotto
        }
        registry.reload();
        registry.clearErrors(guildId, nome);
        const entry = (registry.health(guildId) || []).find((h) => h.id === nome);
        if (!entry) throw new Error('modulo sparito dopo il reload');
        return interaction.reply({ embeds: [withFooter(ok(`Modulo ${nome} ricaricato ✅`, `${entry.title} — ${entry.commands} comandi · protezione azzerata, nessun restart.`.slice(0, 4000)), interaction)] }).catch(() => null);
      } catch (e) {
        try {
          const feat = nome;
          registry.recordError(feat, guildId, e);
        } catch {}
        return interaction.reply({ embeds: [err(`Reload fallito per \`${nome}\`: ${(e?.message || e).toString().slice(0, 1500)}\nIl resto del bot resta attivo.`)], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }

    return interaction.reply({ embeds: [err('Sottocomando sconosciuto.')], flags: MessageFlags.Ephemeral }).catch(() => null);
  },
};
