const { Events, MessageFlags, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logger, logCommand } = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // --- Ticket: select, modali e bottoni ---
    try {
      const ticketHandler = require('../handlers/ticketHandler');
      if (await ticketHandler.handle(interaction)) return;
    } catch (e) {
      console.error('ticketHandler:', e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Errore nel sistema ticket.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return;
    }

    // --- Reaction roles: select rr_select ---
    try {
      const reactionRoleHandler = require('../handlers/reactionRoleHandler');
      if (await reactionRoleHandler.handle(interaction)) return;
    } catch (e) {
      console.error('reactionRoleHandler:', e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Errore nei reaction roles.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return;
    }

    // --- Bottoni (nuke) ---
    if (interaction.isButton()) {
      if (!interaction.guild) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Usa questo bottone dentro un server.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }
      const [action, arg] = (interaction.customId || '').split(':');
      if (action === 'nuke_cancel') {
        try {
          return await interaction.update({ content: '✅ Nuke annullato.', components: [] });
        } catch {
          if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: '✅ Nuke annullato.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          return;
        }
      }
      if (action === 'nuke_confirm') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          if (interaction.replied || interaction.deferred) {
            return interaction.followUp({ content: '❌ Ti serve il permesso Gestisci Canali.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          return interaction.reply({ content: '❌ Ti serve il permesso Gestisci Canali.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const channel = await interaction.guild.channels.fetch(arg).catch(() => null);
        if (!channel?.isTextBased?.() || typeof channel.clone !== 'function') {
          try {
            return await interaction.update({ content: '❌ Canale non valido: usa il nuke solo in canali testuali.', components: [] });
          } catch {
            if (!interaction.replied && !interaction.deferred) {
              return interaction.reply({ content: '❌ Canale non valido.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            return;
          }
        }
        try {
          const clone = await channel.clone({ reason: `Nuke | Mod: ${interaction.user.tag}` });
          await channel.delete(`Nuke | Mod: ${interaction.user.tag}`);
          await clone.send(`💥 Canale rigenerato da ${interaction.user}.`);
          // Il canale originale è eliminato: update() fallirebbe, la reply via webhook funziona.
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '💥 Canale rigenerato.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
        } catch (e) {
          console.error(e);
          try {
            return await interaction.update({ content: '❌ Errore durante il nuke.', components: [] });
          } catch {
            if (!interaction.replied && !interaction.deferred) {
              return interaction.reply({ content: '❌ Errore durante il nuke.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            return;
          }
        }
        return;
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`Comando non trovato: ${interaction.commandName}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Comando non trovato.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Comando non trovato.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return;
    }

    // Controller feature (src/modules): se il modulo è spento per questa
    // guild, il comando non parte. DM: nessun toggle (sempre consentito).
    try {
      if (interaction.guild) {
        const modules = require('../modules/registry');
        const feat = modules.featureOfCommand(command.data.name);
        if (feat && !modules.isEnabled(interaction.guild.id, feat)) {
          const offMsg = {
            content: `⏸️ Il modulo di questo comando è disattivato in questo server. Riattivalo dalla dashboard.`,
            flags: MessageFlags.Ephemeral,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(offMsg).catch(() => {});
          } else {
            await interaction.reply(offMsg).catch(() => {});
          }
          return;
        }
      }
    } catch (e) {
      console.error('modules gate:', e);
    }

    // Permessi personalizzati (stile PeakBot): ruoli custom per comando.
    // NOTA: il check sta VOLUTAMENTE prima del cooldown — un utente respinto qui
    // non deve consumare il cooldown (altrimenti un rifiuto "costa" attesa extra).
    try {
      if (interaction.guild) {
        const customPerms = require('../database/customPerms');
        if (customPerms.hasCustom(interaction.guild.id, command.data.name)) {
          const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
          const roleIds = customPerms.getCommandRoles(interaction.guild.id, command.data.name);
          const memberRoles = interaction.member?.roles?.cache;
          const hasRole = memberRoles ? roleIds.some((id) => memberRoles.has(id)) : false;
          if (!isAdmin && !hasRole) {
            const richiesti = roleIds.map((id) => `<@&${id}>`).join(' / ') || 'ruolo autorizzato';
            const denyMsg = {
              content: `❌ Non hai il permesso di usare \`/${command.data.name}\` (richiede ${richiesti}).`,
              flags: MessageFlags.Ephemeral,
            };
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(denyMsg).catch(() => {});
            } else {
              await interaction.reply(denyMsg).catch(() => {});
            }
            return;
          }
        }
      }
    } catch (e) {
      console.error('customPerms check:', e);
    }

    // Cooldown (registrato solo DOPO il check permessi: chi viene respinto non consuma attesa)
    const { cooldowns } = client;
    if (!cooldowns.has(command.data.name)) cooldowns.set(command.data.name, new Map());
    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
      if (now < expirationTime) {
        const expiredTimestamp = Math.round(expirationTime / 1000);
        const waitMsg = {
          content: `⏳ Aspetta ancora <t:${expiredTimestamp}:R> prima di riusare \`/${command.data.name}\`.`,
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(waitMsg).catch(() => {});
        } else {
          await interaction.reply(waitMsg).catch(() => {});
        }
        return;
      }
    }
    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount).unref?.();

    const startedAt = Date.now();
    try {
      await command.execute(interaction, client);
      try {
        logCommand(interaction.guildId || interaction.guild?.id, interaction.user?.id, interaction.commandName, Date.now() - startedAt);
      } catch {}
    } catch (error) {
      // Controller: traccia l'errore sulla feature (visibile in dashboard),
      // la rottura resta isolata a questo comando.
      try {
        const modules = require('../modules/registry');
        const feat = modules.featureOfCommand(interaction.commandName);
        if (feat) modules.recordError(feat, interaction.guildId || interaction.guild?.id, error);
      } catch {}
      try {
        logger.error(`Errore eseguendo ${interaction.commandName}`, {
          command: interaction.commandName,
          guild: interaction.guildId || interaction.guild?.id || 'dm',
          user: interaction.user?.id || 'sconosciuto',
          stack: error?.stack?.split('\n').slice(0, 5).join(' | ') || String(error),
        });
      } catch {}
      // Report best-effort (max 1 invio) nel canale log della guild. Mai rompere il flusso.
      try {
        if (interaction.guild) {
          const { getGuild } = require('../database/guildConfig');
          const cfg = getGuild(interaction.guild.id);
          if (cfg?.logChannelId) {
            const ch = await interaction.guild.channels.fetch(cfg.logChannelId).catch(() => null);
            if (ch?.isTextBased()) {
              const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Errore comando')
                .addFields(
                  { name: 'Comando', value: `\`/${interaction.commandName}\``, inline: true },
                  { name: 'Utente', value: `${interaction.user} (\`${interaction.user?.tag || interaction.user?.id || 'sconosciuto'}\`)`, inline: true },
                  { name: 'Dettaglio', value: String(error?.message || error).slice(0, 1000) }
                )
                .setTimestamp();
              await ch.send({ embeds: [embed] }).catch(() => {});
            }
          }
        }
      } catch {}
      // L'esecuzione è fallita: non far pagare il cooldown per un errore.
      timestamps.delete(interaction.user.id);
      const errorMsg = { content: "❌ Si è verificato un errore durante l'esecuzione del comando!", flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(errorMsg);
        else await interaction.reply(errorMsg);
      } catch {}
    }
  },
};
