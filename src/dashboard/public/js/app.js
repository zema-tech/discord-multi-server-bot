/* app.js — Mission Control. Moduli+config unificati: click modulo → toggle + form. */
'use strict';

const S = {
  me: null, guilds: [], gid: null, detail: null, schema: [], meta: { channels: [], roles: [] },
  route: 'panoramica', charts: [], selectedMod: null,
};

const NAV = [
  ['panoramica', '📊', 'Panoramica'],
  ['moduli', '🧩', 'Moduli'],
  ['permessi', '🔐', 'Permessi'],
  ['audit', '🧾', 'Audit'],
  ['diag', '🩺', 'Diagnostica'],
];

const $ = (s, r) => (r || document).querySelector(s);
const esc = (v) => String(v ?? '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');

function toast(msg, kind) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (e) {} }, 4200);
}

function apiErr(e) {
  if (e && e.relogin) {
    toast('Sessione scaduta: rieffettua il login.', 'err');
    setTimeout(() => { location.href = '/login'; }, 1200);
    return true;
  }
  toast(e.message || 'Errore.', 'err');
  return false;
}
