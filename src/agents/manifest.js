'use strict';
/**
 * src/agents/manifest.js — Anagrafe agenti: JARVIS + specialisti.
 *
 * JARVIS è l'orchestratore: riceve ogni compito, sceglie lo specialista
 * (o risponde lui se nessuno è adatto) e resta responsabile del risultato.
 * Gli specialisti non si chiamano tra loro: solo JARVIS -> specialista,
 * stesso principio del Commander (cervello -> muscoli).
 */

const AGENTS = [
  {
    id: 'jarvis',
    name: 'JARVIS',
    icon: '⚡',
    role: 'orchestrator',
    tagline: 'Agente principale: capisce, smista, supervisiona.',
    keywords: [],
    tools: ['say', 'note', 'fetchUrl', 'askOwner'],
    // JARVIS non tocca servizi loggati da solo: delega e chiede conferma.
    needsApproval: ['useService'],
    prompt:
      'Sei JARVIS, l\u2019agente principale del server Discord ZealBot. ' +
      'Parli italiano, sei conciso e affidabile. Se un compito esce dalle tue ' +
      'competenze generali, lo hai già smistato a uno specialista: integra il ' +
      'loro lavoro in una risposta finale chiara.',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    icon: '🛡️',
    role: 'specialist',
    tagline: 'Moderazione, sicurezza e anti-raid.',
    keywords: ['ban', 'kick', 'warn', 'mute', 'timeout', 'raid', 'lockdown', 'automod', 'moder', 'sicurezza', 'spam', 'troll', 'regole'],
    tools: ['say', 'note', 'fetchUrl', 'askOwner'],
    needsApproval: ['useService'],
    prompt:
      'Sei Sentinel, specialista di moderazione e sicurezza del server Discord. ' +
      'Dai consigli operativi (comandi, soglie, procedure) in italiano. ' +
      'Per azioni distruttive (ban, kick, lockdown) descrivi il piano e chiedi ' +
      'conferma al proprietario invece di agire d\u2019impulso.',
  },
  {
    id: 'steward',
    name: 'Steward',
    icon: '🎫',
    role: 'specialist',
    tagline: 'Ticket, supporto e accoglienza.',
    keywords: ['ticket', 'supporto', 'aiuto', 'reclamo', 'segnala', 'transcript', 'welcome', 'benvenuto', 'assistenza'],
    tools: ['say', 'note', 'fetchUrl', 'askOwner'],
    needsApproval: ['useService'],
    prompt:
      'Sei Steward, specialista di ticket, supporto e accoglienza. ' +
      'Scrivi risposte pronte da inviare agli utenti: cortesi, chiare, operative. ' +
      'Se mancano informazioni, elenca le domande da fare prima di agire.',
  },
  {
    id: 'maestro',
    name: 'Maestro',
    icon: '🎵',
    role: 'specialist',
    tagline: 'Musica, voice e intrattenimento.',
    keywords: ['musica', 'play', 'canzone', 'coda', 'skip', 'volume', 'loop', 'voice', 'vocale', 'karaoke', 'playlist'],
    tools: ['say', 'note', 'fetchUrl', 'askOwner'],
    needsApproval: ['useService'],
    prompt:
      'Sei Maestro, specialista di musica e canali vocali. ' +
      'Aiuti con code, brani, volumi e setup dei comandi musicali. Rispondi in italiano.',
  },
  {
    id: 'banker',
    name: 'Banker',
    icon: '💰',
    role: 'specialist',
    tagline: 'Economia, livelli e premi.',
    keywords: ['balance', 'daily', 'bank', 'shop', 'soldi', 'monete', 'economia', 'livell', 'xp', 'rank', 'premi', 'lotteria', 'rob', 'slots', 'work'],
    tools: ['say', 'note', 'fetchUrl', 'askOwner'],
    needsApproval: ['useService'],
    prompt:
      'Sei Banker, specialista di economia ed esperienza (XP/livelli). ' +
      'Spieghi bilanci, ricompense e configurazioni con esempi pratici. Rispondi in italiano.',
  },
  {
    id: 'lore',
    name: 'Lore',
    icon: '📚',
    role: 'specialist',
    tagline: 'Conoscenza, riassunti, codice e memoria del server.',
    keywords: ['riassumi', 'spiega', 'codice', 'storia', 'regolamento', 'document', 'traduci', 'idea', 'brain', 'memoria', 'chiedi'],
    tools: ['say', 'note', 'fetchUrl', 'askOwner'],
    needsApproval: ['useService'],
    prompt:
      'Sei Lore, specialista di conoscenza: riassunti, spiegazioni, codice e ' +
      'memoria del server. Risposte italiane, strutturate, senza riempitivi.',
  },
  {
    id: 'scout',
    name: 'Scout',
    icon: '🔭',
    role: 'specialist',
    tagline: 'Web, YouTube e servizi esterni (con login dal vault).',
    keywords: ['youtube', 'video', 'cerca', 'web', 'notizie', 'annunci', 'evento', 'giveaway', 'pubblica', 'servizio', 'api', 'login', 'esterno'],
    tools: ['say', 'note', 'fetchUrl', 'useService', 'askOwner'],
    needsApproval: ['useService'],
    prompt:
      'Sei Scout, specialista di web e servizi esterni. Puoi leggere URL pubblici ' +
      'e usare servizi in cui il proprietario ti ha loggato (vault): non vedi mai ' +
      'le credenziali, ogni uso richiede approvazione. Rispondi in italiano.',
  },
];

function list() {
  return AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    role: a.role,
    tagline: a.tagline,
  }));
}

function get(id) {
  return AGENTS.find((a) => a.id === String(id)) || null;
}

module.exports = { AGENTS, list, get };
