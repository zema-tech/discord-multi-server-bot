/**
 * auditLog — log di moderazione per cancellazioni, modifiche e aggiornamenti membro.
 *
 * NOTA sul loader (`src/index.js` registra UN evento per file): questo modulo espone
 * `MessageDelete` come evento primario e, alla prima esecuzione, aggancia sullo stesso
 * `client` anche i listener `MessageUpdate` e `GuildMemberUpdate` (una sola volta,
 * flag `client._auditLogExtraAttached`). Nessun file esistente viene modificato.
 *
 * - MessageDelete: autore, canale, contenuto (troncato a 1000 char), allegati.
 *   Ignora DM, bot e messaggi senza contenuto testuale né allegati.
 *   Salva anche il messaggio in `snipeCache` per il comando `/snipe`.
 * - MessageUpdate: logga prima/dopo solo se il contenuto testuale cambia.
 * - GuildMemberUpdate: logga solo cambi di nickname, ruoli e timeout.
 *
 * Il canale di log è `logChannelId` da `guildConfig` (solo LETTO via `getGuild`):
 * se non impostato, tutto viene ignorato silenziosamente.
 * Ogni handler è wrappato in try/catch: mai crashare il bot.
 */

const { Events, EmbedBuilder } = require('discord.js');
const { getGuild } = require('../database/guildConfig');
const { setSnipe } = require('../utils/snipeCache');

const MAX_CONTENT = 1000;

function truncate(text, max = MAX_CONTENT) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function attachmentUrls(message, limit = 10) {
  try {
    const list = message.attachments?.values ? [...message.attachments.values()] : message.attachments || [];
    return list.slice(0, limit).map((a) => a?.url).filter(Boolean);
  } catch {
    return [];
  }
}

/** Invia un embed nel canale log della guild, oppure ignora silenziosamente. */
async function sendToLogChannel(guild, embed) {
  try {
    if (!guild) return;
    const cfg = getGuild(guild.id);
    if (!cfg.logChannelId) return;
    const ch = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!ch?.isTextBased()) return;
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    console.error('auditLog send:', e.message);
  }
}

async function handleMessageDelete(message, client) {
  try {
    if (!message?.guild || message.author?.bot) return; // ignora DM e bot
    const content = message.content || '';
    const attachments = attachmentUrls(message);
    if (!content && attachments.length === 0) return; // niente di rilevante

    // Collega la snipe cache (mai far fallire il log per un errore di cache)
    try {
      setSnipe(message.guild.id, message.channelId, {
        authorTag: message.author?.tag || 'Sconosciuto',
        content,
        attachments,
      });
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🗑️ Messaggio eliminato')
      .addFields(
        { name: 'Autore', value: `${message.author} (\`${message.author?.tag || 'sconosciuto'}\`)`, inline: true },
        { name: 'Canale', value: `${message.channel}`, inline: true }
      )
      .setFooter({ text: `ID messaggio: ${message.id || 'sconosciuto'}` })
      .setTimestamp();
    if (content) embed.addFields({ name: 'Contenuto', value: truncate(content) });
    if (attachments.length) {
      embed.addFields({
        name: `Allegati (${attachments.length})`,
        value: attachments.map((u) => `[allegato](${u})`).join('\n').slice(0, 1024),
      });
    }
    await sendToLogChannel(message.guild, embed);
  } catch (e) {
    console.error('auditLog delete:', e.message);
  }
}

async function handleMessageUpdate(oldMessage, newMessage, client) {
  try {
    const msg = newMessage || oldMessage;
    if (!msg?.guild || msg.author?.bot) return; // ignora DM e bot
    const before = oldMessage?.content || '';
    const after = newMessage?.content || '';
    if (!before && !after) return; // niente di rilevante
    if (before === after) return; // es. solo embed/anteprime aggiornati

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('✏️ Messaggio modificato')
      .addFields(
        { name: 'Autore', value: `${msg.author} (\`${msg.author?.tag || 'sconosciuto'}\`)`, inline: true },
        { name: 'Canale', value: `${msg.channel}`, inline: true }
      )
      .setFooter({ text: `ID messaggio: ${msg.id || 'sconosciuto'}` })
      .setTimestamp();
    if (before) embed.addFields({ name: 'Prima', value: truncate(before) });
    if (after) embed.addFields({ name: 'Dopo', value: truncate(after) });
    if (msg.url) embed.setURL(msg.url);
    await sendToLogChannel(msg.guild, embed);
  } catch (e) {
    console.error('auditLog update:', e.message);
  }
}

async function handleGuildMemberUpdate(oldMember, newMember, client) {
  try {
    if (!newMember?.guild) return;
    const changes = [];

    // --- Nickname ---
    const oldNick = oldMember?.nickname ?? null;
    const newNick = newMember?.nickname ?? null;
    if (oldNick !== newNick) {
      changes.push({
        name: 'Nickname',
        value: `\`${oldNick || '(nessuno)'}\` → \`${newNick || '(nessuno)'}\``.slice(0, 1024),
      });
    }

    // --- Ruoli ---
    try {
      const oldRoles = new Set([...(oldMember?.roles?.cache?.keys() || [])]);
      const newRoles = new Set([...(newMember?.roles?.cache?.keys() || [])]);
      const everyoneId = newMember.guild.id;
      const added = [...newRoles].filter((id) => id !== everyoneId && !oldRoles.has(id));
      const removed = [...oldRoles].filter((id) => id !== everyoneId && !newRoles.has(id));
      if (added.length) {
        changes.push({ name: 'Ruoli aggiunti', value: added.map((id) => `<@&${id}>`).join(' ').slice(0, 1024) });
      }
      if (removed.length) {
        changes.push({ name: 'Ruoli rimossi', value: removed.map((id) => `<@&${id}>`).join(' ').slice(0, 1024) });
      }
    } catch {}

    // --- Timeout ---
    const oldT = oldMember?.communicationDisabledUntilTimestamp || null;
    const newT = newMember?.communicationDisabledUntilTimestamp || null;
    if (oldT !== newT) {
      if (newT && newT > Date.now()) {
        changes.push({ name: 'Timeout', value: `Attivato fino a <t:${Math.floor(newT / 1000)}:F>` });
      } else {
        changes.push({ name: 'Timeout', value: 'Rimosso' });
      }
    }

    if (!changes.length) return; // cambio irrilevante: ignora

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('👤 Membro aggiornato')
      .setDescription(`${newMember.user} (\`${newMember.user?.tag || 'sconosciuto'}\`)`)
      .addFields(changes.slice(0, 25))
      .setTimestamp();
    await sendToLogChannel(newMember.guild, embed);
  } catch (e) {
    console.error('auditLog member:', e.message);
  }
}

/** Aggancia una sola volta gli altri due listener sullo stesso client. */
function ensureExtraListeners(client) {
  try {
    if (!client || typeof client.on !== 'function' || client._auditLogExtraAttached) return;
    client._auditLogExtraAttached = true;
    client.on(Events.MessageUpdate, (oldM, newM) => handleMessageUpdate(oldM, newM, client));
    client.on(Events.GuildMemberUpdate, (oldMb, newMb) => handleGuildMemberUpdate(oldMb, newMb, client));
  } catch (e) {
    console.error('auditLog attach:', e.message);
  }
}

module.exports = {
  name: Events.MessageDelete,
  async execute(message, client) {
    ensureExtraListeners(client);
    await handleMessageDelete(message, client);
  },
  handleMessageDelete,
  handleMessageUpdate,
  handleGuildMemberUpdate,
  ensureExtraListeners,
};
