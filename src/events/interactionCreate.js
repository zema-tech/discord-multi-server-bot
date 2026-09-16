const { Events, MessageFlags, PermissionFlagsBits } = require('discord.js');

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

    // --- Bottoni (nuke) ---
    if (interaction.isButton()) {
      const [action, arg] = interaction.customId.split(':');
      if (action === 'nuke_cancel') {
        return interaction.update({ content: '✅ Nuke annullato.', components: [] });
      }
      if (action === 'nuke_confirm') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          return interaction.reply({ content: '❌ Ti serve il permesso Gestisci Canali.', flags: MessageFlags.Ephemeral });
        }
        const channel = await interaction.guild.channels.fetch(arg).catch(() => null);
        if (!channel) return interaction.update({ content: '❌ Canale non trovato.', components: [] });
        try {
          const clone = await channel.clone({ reason: `Nuke | Mod: ${interaction.user.tag}` });
          await channel.delete(`Nuke | Mod: ${interaction.user.tag}`);
          await clone.send(`💥 Canale rigenerato da ${interaction.user}.`);
        } catch (e) {
          console.error(e);
          return interaction.update({ content: '❌ Errore durante il nuke.', components: [] });
        }
        return;
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`Comando non trovato: ${interaction.commandName}`);
      return;
    }

    // Cooldown
    const { cooldowns } = client;
    if (!cooldowns.has(command.data.name)) cooldowns.set(command.data.name, new Map());
    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
      if (now < expirationTime) {
        const expiredTimestamp = Math.round(expirationTime / 1000);
        return interaction.reply({
          content: `⏳ Aspetta ancora <t:${expiredTimestamp}:R> prima di riusare \`/${command.data.name}\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`Errore eseguendo ${interaction.commandName}:`, error);
      const errorMsg = { content: "❌ Si è verificato un errore durante l'esecuzione del comando!", flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(errorMsg);
        else await interaction.reply(errorMsg);
      } catch {}
    }
  },
};
