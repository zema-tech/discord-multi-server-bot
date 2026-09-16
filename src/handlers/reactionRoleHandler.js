const { MessageFlags } = require('discord.js');

async function handle(interaction) {
  if (!interaction.guild) return false;
  if (!interaction.isStringSelectMenu?.()) return false;
  const customId = interaction.customId || '';
  if (!customId.startsWith('rr_')) return false;
  if (customId !== 'rr_select') return false;

  const roleId = interaction.values?.[0];
  if (!roleId) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Selezione non valida.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  }

  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Questo ruolo non esiste più (è stato eliminato).', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  }
  if (role.id === interaction.guild.id || role.managed) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Questo ruolo non può essere assegnato.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  }
  if (!role.editable) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Non ho i permessi per gestire questo ruolo: è sopra il mio ruolo più alto. Contatta uno staffer.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Membro non trovato.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return true;
  }

  try {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Reaction roles: rimozione da menu');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `➖ Ruolo ${role} rimosso!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    } else {
      await member.roles.add(role, 'Reaction roles: assegnazione da menu');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `✅ Ruolo ${role} assegnato!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('reactionRoleHandler:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Non riesco a gestire questo ruolo (gerarchia o permessi insufficienti). Contatta uno staffer.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
  return true;
}

module.exports = { handle };
