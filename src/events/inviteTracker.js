/**
 * inviteTracker — confronto inviti a ogni join per attribuire l'invitante.
 *
 * NOTA sul loader (`src/index.js` registra UN evento per file): questo modulo espone
 * `GuildMemberAdd` come evento primario (coesiste con `guildMemberAdd.js` del welcome:
 * il loader fa `client.on(...)` per ogni file, quindi entrambi girano) e, alla prima
 * esecuzione, aggancia sullo stesso `client` anche il listener `GuildMemberRemove`
 * per il tracking delle uscite (una sola volta, flag
 * `client._inviteTrackerRemoveAttached`). Stesso pattern lazy-attach di `auditLog.js`.
 * Nessun file esistente viene modificato. Nessun messaggio di benvenuto qui
 * (il welcome esiste già in `guildMemberAdd.js`): solo tracking + log.
 *
 * Strategia (niente fetch massivo all'avvio):
 * - GuildMemberAdd: fetch degli inviti correnti, confronto con la cache.
 *   L'invito usato è quello i cui `uses` sono aumentati rispetto alla cache.
 *   - Esattamente 1 candidato con delta > 0 → invitante trovato.
 *   - 0 candidati (es. vanity URL, permessi bot insufficienti) o > 1 (join
 *     simultanei / inviti creati mentre il bot era offline) → ambiguo,
 *     invitante `null` ("sconosciuto").
 *   - Guild senza baseline (cache vuota): al primo join si fa UNA volta sola il
 *     fetch per inizializzare la cache, e il join corrente resta "sconosciuto"
 *     perché non c'è un prima con cui confrontare.
 *   Dopo il confronto la cache viene risincronizzata con il fetch e si chiama
 *   `recordJoin`. Un embed di tracking va nel canale log (`logChannelId` da
 *   `guildConfig`, solo LETTO via `getGuild`); se non configurato, silenzio.
 * - GuildMemberRemove: solo `recordLeave` (conteggio `leaves` dell'invitante),
 *   nessun messaggio (il goodbye esiste già in `guildMemberRemove.js`).
 * Ogni handler è wrappato in try/catch: mai crashare il bot.
 */
const { Events, EmbedBuilder } = require('discord.js');
const { getCache, setCache, recordJoin, recordLeave, getStats } = require('../database/invites');
const { getGuild } = require('../database/guildConfig');

/** Trova l'invito usato: esattamente un candidato con delta > 0, altrimenti null. */
function findUsedInvite(cached, current) {
  const candidates = [];
  const entries = current instanceof Map ? current.entries() : Object.entries(current || {});
  for (const [code, inv] of entries) {
    const prev = cached[code];
    if (!prev) continue; // codice mai visto: nessuna baseline → non attribuibile
    const delta = (Number(inv.uses) || 0) - (Number(prev.uses) || 0);
    if (delta > 0) candidates.push({ code, delta, inv });
  }
  if (candidates.length !== 1) return null; // 0 = vanity/ignoto, >1 = ambiguo
  return candidates[0];
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
    console.error('inviteTracker send:', e.message);
  }
}

async function handleGuildMemberAdd(member, client) {
  try {
    ensureRemoveListener(client);
    if (!member?.guild || member.user?.bot) return; // ignora DM/bot
    const guild = member.guild;

    const cached = getCache(guild.id);
    const hasBaseline = Object.keys(cached).length > 0;

    let current = null;
    try {
      current = await guild.invites.fetch(); // richiede ManageGuild al bot
    } catch {
      current = null;
    }

    let inviterId = null;
    let usedCode = null;
    let usedUses = null;

    if (current && hasBaseline) {
      const found = findUsedInvite(cached, current);
      if (found) {
        usedCode = found.code;
        usedUses = Number(found.inv.uses) || 0;
        inviterId = found.inv.inviter?.id || cached[usedCode]?.inviterId || null;
      }
      // Risincronizza la cache con lo stato reale (upsert + potatura scaduti).
      try {
        const fetchedCodes = new Set(current.keys());
        const next = {};
        for (const [code, inv] of current) {
          next[code] = {
            uses: Number(inv.uses) || 0,
            inviterId: inv.inviter?.id || cached[code]?.inviterId || null,
          };
        }
        void fetchedCodes;
        setCache(guild.id, next);
      } catch {}
    } else if (current && !hasBaseline) {
      // Primo join mai tracciato: inizializza la baseline UNA volta sola.
      // Questo join resta "sconosciuto" (nessun "prima" con cui confrontare).
      // Normalizza come il ramo sopra (conserva inviterId noti) invece di salvare la Collection grezza.
      try {
        const next = {};
        for (const [code, inv] of current) {
          next[code] = {
            uses: Number(inv.uses) || 0,
            inviterId: inv.inviter?.id || cached[code]?.inviterId || null,
          };
        }
        setCache(guild.id, next);
      } catch {}
    }
    // Se current è null (bot senza permessi): cache invariata, join sconosciuto.

    recordJoin(guild.id, inviterId, member.id);

    const stats = getStats(guild.id, inviterId || member.id);
    const avatar = member.user?.displayAvatarURL?.();
    const embed = new EmbedBuilder()
      .setColor(inviterId ? 0x57f287 : 0xfee75c)
      .setTitle('📨 Join tracciato')
      .setDescription(`${member} (\`${member.user?.tag || 'sconosciuto'}\`)`)
      .addFields(
        {
          name: 'Invitato da',
          value: inviterId ? `<@${inviterId}>` : 'Sconosciuto (vanity URL o link diretto?)',
          inline: true,
        },
        {
          name: 'Invito',
          value: usedCode ? `\`${usedCode}\` (usi: ${usedUses ?? '?'})` : '—',
          inline: true,
        }
      )
      .setTimestamp();
    if (avatar) embed.setThumbnail(avatar);
    if (inviterId) {
      embed.addFields({
        name: `Inviti di <@${inviterId}>`,
        value: `✅ ${stats.joins} join • ❌ ${stats.leaves} usciti • 📊 ${stats.valid} validi`,
      });
    }
    await sendToLogChannel(guild, embed);
  } catch (e) {
    console.error('inviteTracker add:', e.message);
  }
}

async function handleGuildMemberRemove(member, client) {
  try {
    if (!member?.guild || member.user?.bot) return;
    // Solo conteggio leaves: nessun messaggio (il goodbye esiste già).
    recordLeave(member.guild.id, member.id);
  } catch (e) {
    console.error('inviteTracker remove:', e.message);
  }
}

/** Aggancia una sola volta il listener GuildMemberRemove sullo stesso client. */
function ensureRemoveListener(client) {
  try {
    if (!client || typeof client.on !== 'function' || client._inviteTrackerRemoveAttached) return;
    client._inviteTrackerRemoveAttached = true;
    client.on(Events.GuildMemberRemove, (member) => handleGuildMemberRemove(member, client));
  } catch (e) {
    console.error('inviteTracker attach:', e.message);
  }
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    await handleGuildMemberAdd(member, client);
  },
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  ensureRemoveListener,
  findUsedInvite,
};
