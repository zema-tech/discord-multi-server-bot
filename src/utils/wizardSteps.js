/**
 * wizardSteps.js — step machine riutilizzabile per il setup guidato (/wizard).
 *
 * Ogni step ha la forma:
 *   { key, label, ask, status(guildId), apply(guild, value) }
 * - key: identificativo stabile dello step.
 * - label: nome breve mostrato all'utente (italiano).
 * - ask: domanda/istruzione mostrata durante il wizard.
 * - status(guildId): stringa leggibile con lo stato attuale (per "mostra stato attuale").
 * - apply(guild, value): scrive SOLO nei DB esistenti e ritorna una stringa di
 *   riepilogo. `guild` può essere l'oggetto Guild discord.js oppure { id }.
 *   Se il valore non è valido ritorna una stringa che inizia con '❌'.
 *
 * Note:
 * - Step panel ticket: l'apply salva solo la config, NON pubblica nulla
 *   (auto-pubblica? NO — ritorna le istruzioni per /ticket panel).
 * - Step starboard: incluso solo se il modulo esiste (require in try/catch).
 */

const { getGuild, updateGuild } = require('../database/guildConfig');
const { getConfig: getTicketConfig, setConfig: setTicketConfig } = require('../database/tickets');

let starboardDb = null;
try {
  // Modulo esistente e stabile: se rimosso in futuro, lo step sparisce da solo.
  starboardDb = require('../database/starboard');
} catch {
  starboardDb = null;
}

function guildIdOf(guild) {
  if (typeof guild === 'string') return guild;
  return guild && guild.id ? String(guild.id) : null;
}

function extractId(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value.id) return String(value.id);
  const m = String(value).match(/(\d{17,20})/);
  return m ? m[1] : null;
}

function isOff(value) {
  if (value == null) return true;
  const s = String(value).trim().toLowerCase();
  return s === '' || s === 'off' || s === 'no' || s === 'none' || s === '0'
    || s === 'disattiva' || s === 'disabilita' || s === 'disattivo';
}

function parseOnOff(value) {
  const s = String(value).trim().toLowerCase();
  if (['on', 'si', 'sì', 'yes', 'true', '1', 'attiva', 'attivo', 'abilita'].includes(s)) return true;
  if (['off', 'no', 'false', '0', 'disattiva', 'disattivo', 'disabilita'].includes(s)) return false;
  return null;
}

const STEPS = [
  {
    key: 'welcome',
    label: 'Canale benvenuto',
    ask: 'Dove vuoi dare il benvenuto ai nuovi membri? Seleziona il canale dal menu, oppure premi **Disattiva**.',
    status(guildId) {
      const c = getGuild(guildId);
      return c.welcomeChannelId ? `<#${c.welcomeChannelId}>` : '— (disattivato)';
    },
    apply(guild, value) {
      const id = guildIdOf(guild);
      if (!id) return '❌ Server non valido.';
      if (isOff(value)) {
        updateGuild(id, { welcomeChannelId: null });
        return '🔕 Benvenuto disattivato.';
      }
      const channelId = extractId(value);
      if (!channelId) return '❌ Canale non valido: seleziona un canale dal menu oppure `off`.';
      updateGuild(id, { welcomeChannelId: channelId });
      return `👋 Canale benvenuto: <#${channelId}>.`;
    },
  },
  {
    key: 'log',
    label: 'Canale log',
    ask: 'Dove vuoi ricevere i log di moderazione? Seleziona il canale dal menu, oppure premi **Disattiva**.',
    status(guildId) {
      const c = getGuild(guildId);
      return c.logChannelId ? `<#${c.logChannelId}>` : '— (disattivato)';
    },
    apply(guild, value) {
      const id = guildIdOf(guild);
      if (!id) return '❌ Server non valido.';
      if (isOff(value)) {
        updateGuild(id, { logChannelId: null });
        return '🔕 Log disattivati.';
      }
      const channelId = extractId(value);
      if (!channelId) return '❌ Canale non valido: seleziona un canale dal menu oppure `off`.';
      updateGuild(id, { logChannelId: channelId });
      return `📝 Canale log: <#${channelId}>.`;
    },
  },
  {
    key: 'ticket',
    label: 'Ticket (categoria + ruolo)',
    ask: 'Dove creare i ticket e chi li gestisce? Seleziona la **categoria** e il **ruolo supporto** dai menu, poi premi **Applica**.',
    status(guildId) {
      const c = getTicketConfig(guildId);
      const cat = c.categoryId ? `<#${c.categoryId}>` : '— (non impostata)';
      const roles = (c.supportRoleIds || []).map((r) => `<@&${r}>`).join(' + ') || '— (nessuno)';
      return `categoria ${cat}, staff ${roles}`;
    },
    apply(guild, value) {
      const id = guildIdOf(guild);
      if (!id) return '❌ Server non valido.';
      const current = getTicketConfig(id);
      let categoryId = current.categoryId || null;
      let supportRoleIds = current.supportRoleIds || [];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const cat = extractId(value.categoryId);
        const role = extractId(value.supportRoleId != null ? value.supportRoleId : value.roleId);
        if (cat) categoryId = cat;
        if (role) supportRoleIds = [role];
      } else if (value != null && !isOff(value)) {
        // Formato stringa: "categoria ruolo" (menzioni <#..> e <@&..> o ID puri, in quest'ordine).
        const ids = String(value).match(/\d{17,20}/g) || [];
        if (ids[0]) categoryId = ids[0];
        if (ids[1]) supportRoleIds = [ids[1]];
      }
      if (!categoryId) return '❌ Manca la categoria: seleziona categoria e ruolo, poi Applica.';
      if (!supportRoleIds.length) return '❌ Manca il ruolo supporto: seleziona categoria e ruolo, poi Applica.';
      setTicketConfig(id, { categoryId, supportRoleIds });
      return `🎫 Ticket: categoria <#${categoryId}>, staff ${supportRoleIds.map((r) => `<@&${r}>`).join(' + ')}.`;
    },
  },
  {
    key: 'panel',
    label: 'Canale panel ticket',
    ask: 'In quale canale va pubblicato il pannello ticket? Seleziona il canale dal menu.',
    status(guildId) {
      const c = getTicketConfig(guildId);
      return c.panelChannelId ? `<#${c.panelChannelId}>` : '— (non impostato)';
    },
    apply(guild, value) {
      const id = guildIdOf(guild);
      if (!id) return '❌ Server non valido.';
      if (isOff(value)) {
        setTicketConfig(id, { panelChannelId: null });
        return '🔕 Canale panel ticket rimosso.';
      }
      const channelId = extractId(value);
      if (!channelId) return '❌ Canale non valido: seleziona un canale dal menu oppure `off`.';
      // Salva SOLO la config: nessuna auto-pubblicazione del pannello.
      setTicketConfig(id, { panelChannelId: channelId });
      return `📌 Canale panel ticket: <#${channelId}> (solo salvato).\n➡️ Per pubblicare il pannello usa \`/ticket panel\`.`;
    },
  },
];

// Soglia starboard: solo se il modulo esiste (require in try/catch sopra).
if (starboardDb) {
  STEPS.push({
    key: 'starboard',
    label: 'Soglia starboard',
    ask: 'Dopo quante ⭐ un messaggio finisce in bacheca? Scegli la soglia dal menu, oppure premi **Disattiva**.',
    status(guildId) {
      const c = starboardDb.getStarboard(guildId);
      const ch = c.channelId ? ` in <#${c.channelId}>` : ' (canale non impostato)';
      return `soglia **${c.threshold}**${ch}`;
    },
    apply(guild, value) {
      const id = guildIdOf(guild);
      if (!id) return '❌ Server non valido.';
      if (isOff(value)) {
        starboardDb.disableStarboard(id);
        return '⭐ Starboard disattivata (canale rimosso, soglia conservata).';
      }
      const n = parseInt(String(value), 10);
      if (!Number.isFinite(n)) return '❌ Soglia non valida: scegli un numero dal menu oppure `off`.';
      const clamped = Math.min(100, Math.max(1, n));
      starboardDb.setStarboard(id, { threshold: clamped });
      const cfg = starboardDb.getStarboard(id);
      const ch = cfg.channelId
        ? ` in <#${cfg.channelId}>`
        : ' (canale non impostato: usa `/starboard imposta` per attivarla del tutto)';
      return `⭐ Soglia starboard: **${cfg.threshold}**${ch}.`;
    },
  });
}

STEPS.push({
  key: 'automod',
  label: 'Automoderazione on/off',
  ask: 'Vuoi tenere attiva l\u2019automoderazione (anti-spam, anti-link, anti-invite)? Premi **Attiva** oppure **Disattiva**.',
  status(guildId) {
    const c = getGuild(guildId);
    return c.automod && c.automod.enabled ? '**ON**' : '**OFF**';
  },
  apply(guild, value) {
    const id = guildIdOf(guild);
    if (!id) return '❌ Server non valido.';
    const on = parseOnOff(value);
    if (on === null) return '❌ Valore non valido: usa `on` oppure `off`.';
    updateGuild(id, { automod: { enabled: on } });
    return `🛡️ Automoderazione **${on ? 'attivata' : 'disattivata'}**.`;
  },
});

function getStep(key) {
  return STEPS.find((s) => s.key === key) || null;
}

module.exports = { STEPS, getStep, HAS_STARBOARD: starboardDb !== null };
