/* app.js — Mission Control. Viste: panoramica, moduli (+dettaglio con config), permessi, audit. */
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

/** Modulo controller -> voci schema mostrate nel dettaglio (extra inclusi).
 *  Tutti gli id del controller mappati: economy->shop, utility->general,
 *  reactionRoles->reactionRoles, moderation include lockdown (read-only).
 *  Solo music resta senza schema: zero chiavi reali (si usa da /musica).
 *  'logging' non ha card propria: è lo stesso logChannelId di Generale. */
const DETAIL_SCHEMA = {
  ai: ['ai'],
  autoresponder: ['autoresponder'],
  autorole: ['autorole'],
  customCommands: ['commands'],
  economy: ['economy', 'shop'],
  fun: ['confessioni', 'birthdays'],
  levels: ['levels', 'rewards'],
  moderation: ['automod', 'lockdown', 'warns'],
  music: ['music'],
  reactionRoles: ['reactionRoles'],
  starboard: ['starboard'],
  system: ['general', 'welcome'],
  tempvoice: ['tempvoice'],
  tickets: ['tickets'],
  utility: [],
  youtube: ['youtube'],
};

/** Messaggio onesto quando non c'è niente da configurare (mai vuoto muto). */
const EMPTY_HINTS = {
  music: 'La musica si comanda da Discord con /musica (play, volume, skip, stop). Niente da configurare qui.',
  utility: 'Setup e preferenze si fanno in Discord con /setup, /wizard, /config e /lingua.',
};

/** Canali obbligatori per modulo schema: se almeno uno è vuoto -> badge "Da configurare". */
const REQUIRED_CHANNELS = {
  tickets: ['panelChannelId'],
  welcome: ['welcomeChannelId'],
  tempvoice: ['lobbyChannelId'],
  starboard: ['channelId'],
  reactionRoles: ['channelId'],
  birthdays: ['channelId'],
};

/** Mini-status per voce schema: [chiave, etichetta]. ✓ se valorizzato. */
const STATUS_CHECKS = {
  general: [['logChannelId', 'log'], ['suggestChannelId', 'idee']],
  welcome: [['welcomeChannelId', 'benvenuto'], ['goodbyeChannelId', 'addii']],
  automod: [['enabled', 'filtri']],
  autorole: [['roleIds', 'ruoli']],
  levels: [['levelupChannelId', 'annunci']],
  tickets: [['logChannelId', 'log'], ['panelChannelId', 'pannello'], ['categoryId', 'cat.']],
  tempvoice: [['lobbyChannelId', 'lobby'], ['categoryId', 'cat.']],
  ai: [['systemPrompt', 'prompt']],
  starboard: [['channelId', 'canale']],
  confessioni: [['channelId', 'canale']],
  reactionRoles: [['channelId', 'canale']],
  birthdays: [['channelId', 'canale']],
};

function isSet(v) {
  if (v === null || v === undefined || v === '' || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Riga mini-status per la card controller (tutte le voci schema mappate). */
function miniStatusHTML(modId) {
  const ids = DETAIL_SCHEMA[modId] || [];
  const mods = (S.detail && S.detail.modules) || {};
  const lists = (S.detail && S.detail.lists) || {};
  const parts = [];
  for (const sid of ids) {
    for (const [key, label] of STATUS_CHECKS[sid] || []) {
      const ok = isSet(mods[sid] && mods[sid][key]);
      parts.push(`<span class="${ok ? 'ok' : 'no'}">${esc(label)} ${ok ? '✓' : '✗'}</span>`);
    }
  }
  if (modId === 'autoresponder') parts.push(`<span class="ok">${(lists.autoresponder || []).length} trigger</span>`);
  if (modId === 'customCommands') parts.push(`<span class="ok">${(lists.customCommands || []).length} comandi</span>`);
  if (modId === 'levels') parts.push(`<span class="ok">${(lists.levelRewards || []).length} premi</span>`);
  if (modId === 'economy') parts.push(`<span class="ok">${(lists.shop || []).length} articoli</span>`);
  if (modId === 'moderation') parts.push(`<span class="ok">${(lists.warnRules || []).length} regole warn</span>`);
  if (modId === 'youtube') parts.push(`<span class="ok">${(lists.youtube || []).length}/10 feed</span>`);
  if (!parts.length) return '';
  return `<div class="mini-status">${parts.join(' · ')}</div>`;
}

/** true se al modulo manca almeno un canale obbligatorio. */
function needsSetup(modId) {
  const ids = DETAIL_SCHEMA[modId] || [];
  const mods = (S.detail && S.detail.modules) || {};
  for (const sid of ids) {
    for (const key of REQUIRED_CHANNELS[sid] || []) {
      if (!isSet(mods[sid] && mods[sid][key])) return true;
    }
  }
  return false;
}
/** Icona modulo: mai testo in chiaro. Gli id del registry usano slug stile
 *  Lucide (cpu, ticket, shield…): mappati a una emoji singola. Se è già
 *  un'emoji valida la tiene, altrimenti fallback neutro. */
const ICON_EMOJI = {
  cpu: '🤖', message: '💬', users: '👥', terminal: '⌨️', cart: '🛒',
  star: '⭐', shield: '🛡️', mic: '🎤', check: '✅', server: '🖥️',
  ticket: '🎫', sliders: '🎚️', tv: '📺', grid: '🧩',
};

function modIcon(m) {
  const raw = String((m && m.icon) || '');
  if (ICON_EMOJI[raw]) return ICON_EMOJI[raw];
  if (raw && !/^[a-z-]+$/.test(raw) && [...raw].length <= 4) return raw;
  return '🧩';
}

/** Nav moduli stile MEE6: categorie con solo voci reali (id controller esistenti).
 *  Niente voci premium copiate (Twitch/TikTok/Instagram/Web3/NFT/Monetize):
 *  ogni voce apre il dettaglio con form reali o messaggio onesto. */
const NAV_CATS = [
  { id: 'essentials', icon: '🛡️', title: 'Essentials', items: ['moderation', 'tickets', 'autorole'] },
  { id: 'server', icon: '🏰', title: 'Server', items: ['levels', 'starboard', 'tempvoice', 'reactionRoles'] },
  { id: 'utilities', icon: '🧰', title: 'Utilities', items: ['customCommands', 'autoresponder', 'youtube', 'utility'] },
  { id: 'fun', icon: '🎉', title: 'Fun', items: ['fun', 'economy', 'music'] },
  { id: 'ai', icon: '🤖', title: 'AI', items: ['ai'] },
  { id: 'settings', icon: '⚙️', title: 'Settings', items: ['system'] },
];

/** Tips brevi per modulo (stile MEE6/Peak: cosa fare prima). */
const MOD_TIPS = {
  ai: ['Attiva solo i sotto-servizi che usi (menzioni, ticket, fun).', 'Scrivi il prompt di sistema in italiano, max 2000 caratteri.', 'Con Risposta menzioni attiva, limita i canali per evitare spam.'],
  autoresponder: ['Modalità: contiene (default), esatta o regex.', 'Usa il pannello sotto per aggiungere/rimuovere senza salvare.'],
  tickets: ['Imposta canale log + canale pannello + categoria prima di aprire ticket.', 'Auto-chiusura 0 = mai (solo manuale); auto-cancellazione pulisce i chiusi.'],
  tempvoice: ['Serve una lobby vocale + una categoria: senza, le stanze non nascono.'],
  starboard: ['Soglia alta = bacheca selettiva; emoji singola e riconoscibile.'],
  moderation: ['Parti con anti-spam + anti-invite, aggiungi il resto dopo.', 'Warnazioni: parti da 3 warn → timeout 10 min.'],
  levels: ['Annunci level-up nello stesso canale se non scegli un canale.'],
  autorole: ['Mai ruoli dei bot; un ritardo di qualche secondo evita i raid.'],
  customCommands: ['I comandi !nome usano {user} {server} {count}; max 20.', 'Con la matita modifichi la risposta senza ricreare il comando.'],
  system: ['Lingua e log stanno in Generale; benvenuto e addii hanno variabili {user} {server} {count}.'],
  fun: ['Le confessioni sono anonime con cooldown anti-abuso.'],
  economy: ['dailyAmount = base /daily (streak aggiunge bonus).', 'workPct scala tutti i lavoretti; lottoPrice sincronizza il piatto.'],
  music: ['Volume applicato a ogni play; poi si cambia con /musica volume.'],
  youtube: ['Max 10 feed; disattivare il modulo ferma solo le notifiche, i feed restano.'],
  birthdays: ['Le date si salvano con /compleanno; qui solo il canale annunci.'],
};
const GENERIC_TIPS = [
  'Attiva il modulo con lo switch: spento, la config resta in bozza.',
  'Canali e ruoli si scelgono dalle liste live del server.',
  'Lascia vuoto un campo per non impostarlo (i numeri vuoti non toccano nulla).',
];

const $ = (s, r) => (r || document).querySelector(s);
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

/* Icona guild (immagine o iniziale) + avatar utente + empty illustrati. */
function guildIcon(g, size) {
  const s = size || 40;
  const name = (g && g.name) || '?';
  if (g && typeof g.icon === 'string' && /^https?:\/\//.test(g.icon)) {
    return `<img class="gicon" width="${s}" height="${s}" src="${esc(g.icon)}" alt="" loading="lazy" onerror="this.outerHTML=${esc(`<span class='gicon ginit' style='width:${s}px;height:${s}px'>${esc(name[0].toUpperCase())}</span>`)}">`;
  }
  return `<span class="gicon ginit" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.42)}px">${esc(name[0].toUpperCase())}</span>`;
}

function emptyArt(msg, hint) {
  return `<div class="empty"><div class="empty-art" aria-hidden="true">
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="30" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 5" opacity="0.7"/>
      <circle cx="36" cy="36" r="18" stroke="var(--border)" stroke-width="2"/>
      <circle cx="36" cy="36" r="5" fill="var(--accent)"/>
      <path d="M36 6v8M36 58v8M6 36h8M58 36h8" stroke="var(--text-dim)" stroke-width="2" stroke-linecap="round"/>
    </svg></div><p>${msg}</p>${hint ? `<p style="font-size:.82rem;">${hint}</p>` : ''}</div>`;
}

function destroyCharts() {
  for (const c of S.charts) { try { c.destroy(); } catch (e) {} }
  S.charts = [];
}

/* ---------------- BOOT ---------------- */

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  try {
    S.me = await Api.me();
    const mb = $('#meBox');
    if (mb && S.me) {
      const av = S.me.avatarUrl
        ? `<img src="${esc(S.me.avatarUrl)}" alt="" width="26" height="26" style="border-radius:50%;vertical-align:-7px;margin-right:.4rem;">`
        : '🧑‍🚀 ';
      mb.innerHTML = `${av}@${esc(S.me.username || '?')}`;
    }
  } catch (e) { return apiErr(e); }
  try {
    const g = await Api.guilds();
    S.guilds = Array.isArray(g.guilds) ? g.guilds : (Array.isArray(g) ? g : []);
  } catch (e) { return apiErr(e); }
  const hashGid = (location.hash.match(/gid=([0-9]+)/) || [])[1];
  const manageable = S.guilds.filter((x) => x && (x.canManage || x.botPresent));
  const pick = S.guilds.find((x) => x && x.id === hashGid) || manageable[0] || S.guilds[0];
  renderGuildPick();
  if (!pick) {
    $('#view').innerHTML = topbar('👋 Benvenuto', 'Nessun server trovato') +
      emptyArt('Nessun server gestibile.',
        'Il bot deve stare nei tuoi server E tu devi poterli gestire. <a href="/login">Riaccedi</a> o invita il bot, poi <button class="icon-btn" onclick="location.reload()">🔄 ricarica</button>');
    return;
  }
  await selectGuild(pick.id);
  window.addEventListener('hashchange', onHash);
  document.addEventListener('keydown', cmdkKeys);
}

/* Picker server con icone (niente <select>: si vedono i server). */
function renderGuildPick() {
  const box = $('#guildPick');
  if (!box) return;
  const cur = S.guilds.find((g) => g.id === S.gid) || {};
  box.innerHTML = `
    <button class="gpick-btn" id="gpickBtn" aria-haspopup="true">
      ${guildIcon(cur, 34)}
      <span class="gpick-name">${esc(cur.name || 'Server…')}</span>
      <span class="gpick-chev">▾</span>
    </button>
    <div class="gpick-list" id="gpickList" hidden>
      ${S.guilds.map((g) => `
        <button class="gpick-item${g.id === S.gid ? ' sel' : ''}" data-gpick="${esc(g.id)}">
          ${guildIcon(g, 32)}
          <span class="gpick-item-tx"><b>${esc(g.name || g.id)}</b>
          <small>${g.botPresent ? (g.memberCount != null ? `👥 ${g.memberCount}` : 'bot dentro ✅') : 'bot assente ⚠️'}</small></span>
          ${g.inviteUrl && !g.botPresent ? `<a class="icon-btn" href="${esc(g.inviteUrl)}" target="_blank" rel="noopener" data-stop="1">＋ invita</a>` : ''}
        </button>`).join('') || '<div class="empty">Nessun server.</div>'}
    </div>`;
  const btn = $('#gpickBtn'), list = $('#gpickList');
  btn.onclick = (e) => { e.stopPropagation(); list.hidden = !list.hidden; };
  document.addEventListener('click', () => { try { list.hidden = true; } catch (e) {} }, { once: true });
  box.querySelectorAll('[data-gpick]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-stop]')) return;
      list.hidden = true;
      if (el.dataset.gpick !== S.gid) selectGuild(el.dataset.gpick);
    };
  });
}

function renderGuildSel() { renderGuildPick(); }

async function selectGuild(gid) {
  S.gid = gid;
  location.hash = 'gid=' + gid;
  renderGuildSel();
  await loadGuild();
}

async function loadGuild() {
  const v = $('#view');
  v.innerHTML = '<div class="skel"></div><div class="skel" style="margin-top:.8rem"></div>';
  destroyCharts();
  try {
    const [detail, schema, meta] = await Promise.all([
      Api.detail(S.gid),
      Api.schema(S.gid).catch(() => []),
      Api.meta(S.gid).catch(() => ({ channels: [], roles: [] })),
    ]);
    S.detail = detail;
    S.schema = Array.isArray(schema) ? schema : [];
    S.meta = meta || { channels: [], roles: [] };
  } catch (e) {
    const retried = apiErr(e);
    if (retried) return;
    v.innerHTML = topbar('😵 Caricamento fallito', 'Il server non risponde come dovrebbe') +
      emptyArt('Non riesco a leggere questo server.',
        'Controlla la <a href="#" onclick="go(\'diag\');return false;">Diagnostica</a> o <button class="icon-btn" onclick="location.reload()">🔄 riprova</button>');
    return;
  }
  renderNav();
  onHash();
}

function onHash() {
  const h = location.hash;
  let r = (h.match(/view=([a-z]+)/) || [])[1];
  if (r === 'config') r = 'moduli'; // voce rimossa: Configurazione vive nel dettaglio modulo
  S.route = NAV.some((n) => n[0] === r) ? r : 'panoramica';
  S.selectedMod = S.route === 'moduli' ? ((h.match(/mod=([A-Za-z0-9-]+)/) || [])[1] || null) : null;
  renderNav();
  if (S.route === 'moduli' && S.selectedMod) return vModuleDetail(S.selectedMod);
  ({ panoramica: vOverview, moduli: vModules, permessi: vPerms, audit: vAudit, diag: vDiag })[S.route]();
}

function renderNav() {
  $('#sideNav').innerHTML = NAV.map(([id, ico, label]) =>
    `<button class="side-link${S.route === id ? ' active' : ''}" data-nav="${id}"><span>${ico}</span>${label}</button>`
  ).join('');
  document.querySelectorAll('[data-nav]').forEach((b) => {
    b.onclick = () => { location.hash = `gid=${S.gid}&view=${b.dataset.nav}`; };
  });
}

function go(route) { location.hash = `gid=${S.gid}&view=${route}`; }

function guildName() {
  try { return (S.detail && S.detail.guild && S.detail.guild.name) || 'Server'; } catch (e) { return 'Server'; }
}

function topbar(title, sub) {
  return `<div class="topbar"><div><h1>${title}</h1><div class="sub">${sub}</div></div>` +
    `<span class="cmdk-hint"><span class="kbd">Ctrl</span> + <span class="kbd">K</span> palette</span></div>`;
}

/* ---------------- PANORAMICA ---------------- */

function vOverview() {
  const d = S.detail || {};
  const c = d.counts || {};
  const st = d.stats || {};
  const ctl = Array.isArray(d.controller) ? d.controller : [];
  const on = ctl.filter((m) => m.enabled && !m.isolated).length;
  const iso = ctl.filter((m) => m.isolated).length;
  const tickets = st.tickets || {};
  const g = (d.guild) || {};
  $('#view').innerHTML = topbar(`📊 ${esc(guildName())}`, 'Stato live dal Commander') + `
    <div class="guild-hero">
      ${guildIcon(g, 64)}
      <div><h2>${esc(g.name || guildName())}</h2>
      <div class="sub mono">${esc(g.id || S.gid || '')} · 👥 ${c.members ?? '—'} membri · #${c.channels ?? '—'} canali · 👑 ${c.roles ?? '—'} ruoli</div></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${c.members ?? '—'}</b><span>membri</span></div>
      <div class="stat ok"><b>${on}/${ctl.length || '—'}</b><span>moduli attivi</span></div>
      <div class="stat${iso ? ' warn' : ''}"><b>${iso}</b><span>in protezione 🛡️</span></div>
      <div class="stat"><b>${st.openTickets ?? tickets.open ?? '—'}</b><span>ticket aperti</span></div>
    </div>
    <div class="chart-box"><h3>📈 Attività (30 giorni)</h3><canvas class="chart" id="chTrend"></canvas></div>
    <div class="grid-3" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));display:grid;gap:1rem;">
      <div class="card"><h3>⭐ Top livelli</h3><div id="topLv"></div></div>
      <div class="card"><h3>🪙 Top economia</h3><div id="topEco"></div></div>
      <div class="card"><h3>🎫 Ticket</h3><div id="tInfo"></div></div>
    </div>`;
  drawTrend(st.trends || []);
  $('#topLv').innerHTML = tableOrEmpty(st.levels, (r) => `<td class="mono">&lt;@${esc(r.id)}&gt;</td><td>Lv <b>${r.level ?? 0}</b></td><td class="mono">${r.total ?? ''}</td>`);
  $('#topEco').innerHTML = tableOrEmpty(st.economy, (r) => `<td class="mono">&lt;@${esc(r.id)}&gt;</td><td class="mono"><b>${r.balance ?? r.total ?? 0}</b> 🪙</td>`);
  $('#tInfo').innerHTML = `<p style="color:var(--text-secondary);font-size:.92rem;margin:.2rem 0;">
    Aperti: <b>${tickets.open ?? st.openTickets ?? 0}</b> · Chiusi: <b>${tickets.closed ?? 0}</b>` +
    (tickets.avgRating != null ? ` · ⭐ <b>${tickets.avgRating}/5</b>` : '') + `</p>`;
}

function tableOrEmpty(rows, fn) {
  if (!Array.isArray(rows) || !rows.length) return '<div class="empty">Nessun dato.</div>';
  return `<table class="tbl"><tbody>${rows.slice(0, 5).map((r) => `<tr>${fn(r)}</tr>`).join('')}</tbody></table>`;
}

function drawTrend(trends) {
  const cv = $('#chTrend');
  if (!cv) return;
  if (typeof Chart === 'undefined' || !Array.isArray(trends) || !trends.length) {
    cv.outerHTML = '<div class="empty">Trend non disponibili.</div>';
    return;
  }
  const keys = Object.keys(trends[0]).filter((k) => k !== 'date');
  const labels = trends.map((t) => String(t.date || '').slice(5));
  const colors = ['#7983ff', '#57f287', '#5cc8ff'];
  destroyCharts();
  try {
    S.charts.push(new Chart(cv, {
      type: 'line',
      data: {
        labels,
        datasets: keys.slice(0, 3).map((k, i) => ({
          label: k,
          data: trends.map((t) => Number(t[k]) || 0),
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length] + '22',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
        })),
      },
      options: {
        plugins: { legend: { labels: { color: '#b9c0d4' } } },
        scales: {
          x: { ticks: { color: '#7d8699', maxTicksLimit: 8 }, grid: { color: '#1e2436' } },
          y: { ticks: { color: '#7d8699' }, grid: { color: '#1e2436' }, beginAtZero: true },
        },
      },
    }));
  } catch (e) { /* Chart.js opzionale */ }
}

/* ---------------- MODULI ---------------- */

function modBadge(m) {
  if (m.isolated) return '<span class="badge iso">🛡️ protezione</span>';
  if (!m.enabled) return '<span class="badge off">spento</span>';
  if (m.errors && m.errors.length) return '<span class="badge err">errori</span>';
  return '<span class="badge on">attivo</span>';
}

function vModules() {
  S.selectedMod = null;
  const ctl = Array.isArray(S.detail.controller) ? S.detail.controller : [];
  const byId = {};
  for (const m of ctl) if (m && m.id) byId[m.id] = m;
  const row = (m) => `
      <div class="mod mod-row${m.enabled && !m.isolated ? '' : ' off'}" data-open="${esc(m.id)}" title="Apri dettaglio" tabindex="0" role="button" aria-label="Configura ${esc(m.title || m.id)}">
        <span class="ico" aria-hidden="true">${modIcon(m)}</span>
        <div class="mod-row-main">
          <div class="mod-head">
            <div><h3>${esc(m.title || m.id)}</h3><span class="ver mono">${esc(m.commands ?? 0)} comandi</span></div>
          </div>
          <p class="desc">${esc(m.description || '')}</p>
          ${miniStatusHTML(m.id)}
        </div>
        <div class="mod-foot">
          <label class="switch" title="on/off"><input type="checkbox" data-toggle="${esc(m.id)}"${m.enabled ? ' checked' : ''} ${m.locked ? ' disabled' : ''}><span class="tr"></span></label>
          ${m.locked ? '<span class="badge">🔒 sistema</span>' : modBadge(m)}
          ${m.enabled && !m.isolated && !m.locked && needsSetup(m.id) ? '<span class="badge setup">⚙️ da configurare</span>' : ''}
        </div>
      </div>`;
  const cats = NAV_CATS.map((c) => {
    const items = c.items.map((id) => byId[id]).filter(Boolean);
    if (!items.length) return '';
    return `<section class="mod-cat"><h2>${esc(c.icon)} ${esc(c.title)}</h2>` +
      items.map(row).join('') + `</section>`;
  }).join('');
  const orphans = ctl.filter((m) => !NAV_CATS.some((c) => c.items.includes(m.id)));
  $('#view').innerHTML = topbar('🧩 Moduli', `${ctl.length} moduli · click sulla riga per configurare, switch per on/off`) +
    cats + (orphans.length ? `<section class="mod-cat"><h2>📦 Altri</h2>` + orphans.map(row).join('') + `</section>` : '');
  document.querySelectorAll('[data-open]').forEach((card) => {
    const open = () => { location.hash = `gid=${S.gid}&view=moduli&mod=${encodeURIComponent(card.dataset.open)}`; };
    card.onclick = (e) => {
      if (e.target.closest('label.switch, input, button, a')) return; // switch non apre il dettaglio
      open();
    };
    card.onkeydown = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); open(); }
    };
  });
  document.querySelectorAll('[data-toggle]').forEach((t) => {
    t.onchange = async () => {
      const id = t.dataset.toggle;
      t.disabled = true;
      try {
        const r = await Api.toggle(S.gid, id, t.checked);
        toast(`${id} ${t.checked ? 'attivato ✅' : 'disattivato ⏸️'}`, 'ok');
        await refreshController();
      } catch (e) {
        t.checked = !t.checked;
        apiErr(e);
      } finally { t.disabled = false; }
    };
  });
}

/** Dettaglio modulo: stato + switch + default/tips + form schema. */
function vModuleDetail(modId) {
  S.selectedMod = modId;
  const ctl = Array.isArray(S.detail.controller) ? S.detail.controller : [];
  const m = ctl.find((x) => x && x.id === modId);
  if (!m) {
    $('#view').innerHTML = topbar('Modulo non trovato', '') +
      `<div class="empty">Nessun modulo <span class="mono">${esc(modId)}</span> in questo server.</div>
       <button class="btn btn-sm" data-back>← Indietro ai moduli</button>`;
  wireBack();
  const saveAll = document.querySelector('[data-save-all]');
  if (saveAll) {
    saveAll.onclick = async () => {
      const cards = [...document.querySelectorAll('.form-card[data-module]')]
        .filter((c) => c.querySelector('[data-fkey]'));
      if (!cards.length) return toast('Niente da salvare qui.', 'err');
      saveAll.disabled = true;
      let ok = 0, fail = 0;
      for (const card of cards) {
        try {
          await Api.saveModule(S.gid, card.dataset.module, collectFields(card));
          ok++;
        } catch (e) { fail++; apiErr(e); }
      }
      saveAll.disabled = false;
      if (ok) toast(`Salvato ${ok} modulo${ok > 1 ? 'i' : ''} ✅`, 'ok');
      if (!fail) {
        try { S.detail = await Api.detail(S.gid); vModuleDetail(S.selectedMod); } catch {}
      }
    };
  }
    return;
  }
  const schemaIds = DETAIL_SCHEMA[modId] || [];
  const entries = S.schema.filter((s) => schemaIds.includes(s.module));
  const mods = (S.detail && S.detail.modules) || {};
  const cards = entries.map((s) => configCardHTML(s, mods)).join('');
  const tips = [...(MOD_TIPS[modId] || []), ...GENERIC_TIPS];
  const defaults = entries.flatMap((s) => (Array.isArray(s.fields) ? s.fields : [])
    .filter((f) => f.placeholder)
    .map((f) => `<div><b>${esc(f.label)}</b><span>${esc(f.placeholder)}</span></div>`));
  const errs = Array.isArray(m.errors) ? m.errors.length : 0;
  $('#view').innerHTML =
    `<div class="mod-detail-bar">
       <button class="btn btn-sm" data-back>← Moduli</button>
       <span class="ico" aria-hidden="true">${modIcon(m)}</span>
       <h1>${esc(m.title || m.id)}</h1>
       ${m.locked ? '<span class="badge">🔒 sistema</span>' : modBadge(m)}
       <label class="switch" title="on/off"><input type="checkbox" data-toggle-detail${m.enabled ? ' checked' : ''} ${m.locked ? ' disabled' : ''}><span class="tr"></span></label>
       <button class="btn btn-primary btn-sm" data-save-all>💾 Salva</button>
     </div>
     <p class="sub">Stato: <b>${m.enabled ? 'attivo' : 'spento'}</b> · protezione: <b>${m.isolated ? 'isolato 🛡️' : 'ok'}</b> · errori: <b>${errs}</b> · v${esc(m.version || '?')} · ${esc(m.commands ?? 0)} comandi</p>
     <div class="defaults-box"><h4>💡 Default e suggerimenti</h4>${tips.map((t) => `<div>• ${esc(t)}</div>`).join('')}${defaults.join('')}</div>
     <div class="mod-detail-grid">${cards || `<div class="empty">${esc(EMPTY_HINTS[modId] || 'Nessun campo: si gestisce da Discord.')}</div>`}</div>`;
  wireBack();
  const tgl = document.querySelector('[data-toggle-detail]');
  if (tgl) {
    tgl.onchange = async () => {
      tgl.disabled = true;
      try {
        await Api.toggle(S.gid, m.id, tgl.checked);
        toast(`${m.id} ${tgl.checked ? 'attivato ✅' : 'disattivato ⏸️'}`, 'ok');
        await refreshController();
      } catch (e) {
        tgl.checked = !tgl.checked;
        apiErr(e);
      } finally { tgl.disabled = false; }
    };
  }
  wireConfig();
}

function wireBack() {
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.onclick = () => { location.hash = `gid=${S.gid}&view=moduli`; };
  });
}

/** Card di config di una voce schema (stesso markup di Configurazione, riusato nel dettaglio). */
function configCardHTML(s, mods) {
  const cur = (mods[s.module] && typeof mods[s.module] === 'object') ? mods[s.module] : {};
  let inner = '';
  if (Array.isArray(s.fields) && s.fields.length) {
    inner = `<fieldset class="fldset"><legend>${esc(s.title)}</legend>` +
      s.fields.map((f) => fieldInput(s.module, f, cur[f.key])).join('') +
      `<button class="btn btn-primary btn-sm" data-save="${esc(s.module)}">💾 Salva ${esc(s.title)}</button></fieldset>`;
  }
  if (s.custom === 'autoresponder') inner += customAutoresponder(cur);
  if (s.custom === 'commands') inner += customCommands(cur);
  if (s.custom === 'rewards') inner += customRewards(cur);
  if (s.custom === 'shop') inner += customShop();
  if (s.custom === 'rrOptions') inner += customRROptions();
  if (s.custom === 'lockdown') inner += customLockdown();
  if (s.custom === 'warns') inner += customWarns();
  if (s.custom === 'youtube') inner += customYT();
  if (!inner) inner = '<div class="empty">Nessun campo: si gestisce da Discord o pannello dedicato.</div>';
  return `<div class="form-card" data-module="${esc(s.module)}"><h3>${esc(s.icon || '⚙️')} ${esc(s.title)}</h3><p class="fdesc">${esc(s.description || '')}</p>${inner}</div>`;
}

/** Anteprima live stile Discord per i messaggi con {user} {server} {count}. */
function messagePreviewInner(text) {
  const rendered = esc(String(text || 'Anteprima messaggio…'))
    .replaceAll('{user}', '@utente').replaceAll('{username}', 'utente')
    .replaceAll('{server}', esc(guildName())).replaceAll('{count}', '128');
  return `<span class="lp-bot">B</span><div><b>Multi-Server Bot</b> <span>oggi</span><p>${rendered}</p></div>`;
}

function messagePreview(text) {
  return `<div class="live-preview">${messagePreviewInner(text)}</div>`;
}

async function refreshController() {
  try {
    const d = await Api.detail(S.gid);
    S.detail = d;
    if (S.route === 'moduli') {
      if (S.selectedMod) vModuleDetail(S.selectedMod);
      else vModules();
    }
  } catch (e) { apiErr(e); }
}

/* ---------------- CONFIGURAZIONE (schema-driven) ---------------- */

function fieldInput(mod, f, cur) {
  const val = cur != null ? cur : '';
  const name = `f_${mod}_${f.key}`;
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  // Select con ricerca quando le opzioni sono tante (>8), altrimenti ordinate.
  const filterBox = (count) => count > 8
    ? `<input type="search" class="filter" data-filter-for="${esc(name)}" placeholder="🔍 Cerca…" autocomplete="off">`
    : '';
  const optList = (items, fmt) => [...items]
    .sort((a, b) => String(fmt(a).label).localeCompare(String(fmt(b).label), 'it'))
    .map((x) => { const o = fmt(x); return `<option value="${esc(o.value)}"${o.sel ? ' selected' : ''}>${esc(o.label)}</option>`; })
    .join('');
  switch (f.type) {
    case 'bool':
      return `<label class="check-row"><input type="checkbox" data-fkey="${esc(f.key)}"${val ? ' checked' : ''}> ${esc(f.label)}${help}</label>`;
    case 'number':
      return `<div class="field"><label>${esc(f.label)}</label><input type="number" data-fkey="${esc(f.key)}" value="${esc(val)}">${help}</div>`;
    case 'text': {
      const hasVars = /{(user|username|server|count)}/.test(String(f.placeholder || '')) || /Message|Messaggio|messaggio/.test(f.label);
      const ta = f.multiline
        ? `<textarea data-fkey="${esc(f.key)}" data-preview="${hasVars ? '1' : ''}"${ph}>${esc(val)}</textarea>`
        : `<input type="text" data-fkey="${esc(f.key)}" value="${esc(val)}"${ph}>`;
      return `<div class="field"><label>${esc(f.label)}</label>${ta}${help}` +
        (hasVars && f.multiline ? `<div class="live-preview" data-preview-box>${messagePreview(val)}</div>` : '') + `</div>`;
    }
    case 'channel': {
      const chs = (S.meta.channels || []).filter((c) => c.type === 0 || c.type === 'GUILD_TEXT' || c.type == null);
      const opts = `<option value="">— nessuno —</option>` + optList(chs, (c) => ({ value: c.id, label: '#' + (c.name || c.id), sel: String(val) === String(c.id) }));
      return `<div class="field"><label>${esc(f.label)}</label>${filterBox(chs.length)}<select id="${esc(name)}" data-fkey="${esc(f.key)}">${opts}</select>${help}</div>`;
    }
    case 'roles': {
      const roles = (S.meta.roles || []).filter((r) => !r.managed && r.id !== S.gid);
      const curArr = Array.isArray(val) ? val.map(String) : [];
      const opts = optList(roles, (r) => ({ value: r.id, label: '@' + r.name, sel: curArr.includes(String(r.id)) }));
      return `<div class="field"><label>${esc(f.label)}</label>${filterBox(roles.length)}<select id="${esc(name)}" multiple size="5" data-fkey="${esc(f.key)}">${opts}</select>${help}</div>`;
    }
    case 'channels': {
      const chs = (S.meta.channels || []).filter((c) => c.type === 0 || c.type === 'GUILD_TEXT' || c.type == null);
      const curArr = Array.isArray(val) ? val.map(String) : [];
      const opts = optList(chs, (c) => ({ value: c.id, label: '#' + (c.name || c.id), sel: curArr.includes(String(c.id)) }));
      return `<div class="field"><label>${esc(f.label)}</label>${filterBox(chs.length)}<select id="${esc(name)}" multiple size="5" data-fkey="${esc(f.key)}">${opts}</select>${help}</div>`;
    }
    case 'lang':
      return `<div class="field"><label>${esc(f.label)}</label><select data-fkey="${esc(f.key)}">
        <option value="it"${val === 'it' ? ' selected' : ''}>Italiano</option>
        <option value="en"${val === 'en' ? ' selected' : ''}>English</option></select>${help}</div>`;
    case 'emoji':
      return `<div class="field"><label>${esc(f.label)}</label><input type="text" data-fkey="${esc(f.key)}" value="${esc(val)}" maxlength="50">${help}</div>`;
    default:
      return `<div class="field"><label>${esc(f.label)}</label><input type="text" data-fkey="${esc(f.key)}" value="${esc(val)}">${help}</div>`;
  }
}

/* vConfig rimossa: la configurazione vive nel dettaglio modulo (vModuleDetail).
   configCardHTML sopra riusa lo stesso markup; wireConfig/fieldInput/custom*
   invariati. */

function collectFields(card) {
  const patch = {};
  card.querySelectorAll('[data-fkey]').forEach((el) => {
    const k = el.dataset.fkey;
    if (el.type === 'checkbox') patch[k] = el.checked;
    else if (el.tagName === 'SELECT' && el.multiple) patch[k] = [...el.selectedOptions].map((o) => o.value);
    else if (el.type === 'number') patch[k] = el.value === '' ? null : Number(el.value);
    else patch[k] = el.value;
  });
  return patch;
}

function wireConfig() {
  document.querySelectorAll('[data-save]').forEach((b) => {
    b.onclick = async () => {
      const mod = b.dataset.save;
      const card = b.closest('.form-card');
      b.disabled = true;
      try {
        await Api.saveModule(S.gid, mod, collectFields(card));
        toast(`${mod} salvato ✅`, 'ok');
        const d = await Api.detail(S.gid);
        S.detail = d;
      } catch (e) { apiErr(e); } finally { b.disabled = false; }
    };
  });
  // Filtro live per le select lunghe (canali/ruoli cercabili).
  document.querySelectorAll('[data-filter-for]').forEach((inp) => {
    const sel = document.getElementById(inp.dataset.filterFor);
    if (!sel) return;
    inp.oninput = () => {
      const q = inp.value.toLowerCase();
      for (const o of sel.options) {
        o.hidden = q !== '' && !o.text.toLowerCase().includes(q) && !o.selected;
      }
    };
  });
  // Preview live per i messaggi con variabili.
  document.querySelectorAll('textarea[data-preview="1"]').forEach((ta) => {
    const box = ta.closest('.field') ? ta.closest('.field').querySelector('[data-preview-box]') : null;
    if (!box) return;
    ta.oninput = () => { box.innerHTML = messagePreviewInner(ta.value); };
  });
  wireLists();
}

/* ---- pannelli custom: autoresponder / commands / rewards ---- */

function customAutoresponder() {
  const list = ((S.detail.lists || {}).autoresponder) || [];
  const rows = list.map((t) => `<tr><td class="mono">${esc(t.match || t.id || '?')}</td><td>${esc((t.response || '').slice(0, 90))}</td>
    <td class="mono">${esc(t.mode || 'include')}${t.caseSensitive ? ' 🔠' : ''}</td><td><button class="icon-btn danger" data-ar-del="${esc(t.id)}">🗑️</button></td></tr>`).join('');
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length} trigger</span></div>
    <table class="tbl"><thead><tr><th>Trigger</th><th>Risposta</th><th>Modo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nessun trigger.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <input type="text" id="arMatch" class="grow" placeholder="Parola trigger…" maxlength="200">
      <input type="text" id="arResp" class="grow" placeholder="Risposta…" maxlength="1500">
      <select id="arMode" title="Modalità"><option value="include">contiene</option><option value="exact">esatta</option><option value="regex">regex</option></select>
      <label class="check-row" title="Maiuscole/minuscole"><input type="checkbox" id="arCase"> Aa</label>
      <button class="btn btn-primary btn-sm" id="arAdd">➕ Aggiungi</button>
    </div>
    <p class="help">exact = messaggio identico · regex = pattern (es. ^ciao.*) · 🔠 = distingue maiuscole.</p>`;
}

function customCommands() {
  const list = ((S.detail.lists || {}).customCommands) || [];
  const rows = list.map((t) => `<tr><td class="mono">!${esc(t.name || '?')}</td><td>${esc((t.response || '').slice(0, 90))}</td>
    <td class="mono">${t.uses ?? ''}</td><td style="white-space:nowrap"><button class="icon-btn" data-cc-edit="${esc(t.name)}" title="Modifica">✏️</button> <button class="icon-btn danger" data-cc-del="${esc(t.name)}">🗑️</button></td></tr>`).join('');
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length}/20 comandi</span></div>
    <table class="tbl"><thead><tr><th>Comando</th><th>Risposta</th><th>Usi</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nessun comando. Variabili: {user} {args} {count}…</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <input type="text" id="ccName" class="grow" placeholder="nome (senza !)…" maxlength="20">
      <input type="text" id="ccResp" class="grow" placeholder="Risposta…" maxlength="1500">
      <button class="btn btn-primary btn-sm" id="ccAdd">➕ Crea</button>
    </div>`;
}

function customRewards() {
  const list = ((S.detail.lists || {}).levelRewards) || [];
  const rows = list.map((t) => `<tr><td>Livello <b>${t.level}</b></td><td class="mono">&lt;@&amp;${esc(t.roleId)}&gt;</td>
    <td><button class="icon-btn danger" data-rw-del="${t.level}">🗑️</button></td></tr>`).join('');
  const roles = (S.meta.roles || []).filter((r) => !r.managed && r.id !== S.gid);
  return `<table class="tbl"><thead><tr><th>Livello</th><th>Ruolo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">Nessuna ricompensa.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <input type="number" id="rwLevel" min="1" max="100" placeholder="Livello">
      <select id="rwRole" class="grow">${roles.map((r) => `<option value="${esc(r.id)}">@${esc(r.name)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" id="rwAdd">➕ Assegna</button>
    </div>`;
}

function customShop() {  const list = ((S.detail.lists || {}).shop) || [];
  const rows = list.map((t) => `<tr><td class="mono">&lt;@&amp;${esc(t.roleId)}&gt;</td><td><b>${t.price}</b> 🪙</td>
    <td><button class="icon-btn danger" data-sh-del="${esc(t.roleId)}">🗑️</button></td></tr>`).join('');
  const roles = (S.meta.roles || []).filter((r) => !r.managed && r.id !== S.gid);
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length} articoli</span></div>
    <table class="tbl"><thead><tr><th>Ruolo</th><th>Prezzo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">Negozio vuoto: si compra con /shop.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <select id="shRole" class="grow">${roles.map((r) => `<option value="${esc(r.id)}">@${esc(r.name)}</option>`).join('')}</select>
      <input type="number" id="shPrice" min="1" max="10000000" placeholder="Prezzo 🪙" style="max-width:9rem">
      <button class="btn btn-primary btn-sm" id="shAdd">➕ Aggiungi</button>
    </div>`;
}

function customRROptions() {
  const list = ((S.detail.lists || {}).rrOptions) || [];
  const rows = list.map((o) => `<tr><td>${esc(o.emoji || '')}</td><td>${esc(o.label || o.roleId)}</td><td class="mono">&lt;@&amp;${esc(o.roleId)}&gt;</td>
    <td><button class="icon-btn danger" data-rro-del="${esc(o.roleId)}">🗑️</button></td></tr>`).join('');
  const roles = (S.meta.roles || []).filter((r) => !r.managed && r.id !== S.gid);
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length} opzioni</span></div>
    <table class="tbl"><thead><tr><th>Emoji</th><th>Etichetta</th><th>Ruolo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nessuna opzione: la pubblicazione resta da /reactionroles.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <select id="rroRole" class="grow">${roles.map((r) => `<option value="${esc(r.id)}">@${esc(r.name)}</option>`).join('')}</select>
      <input type="text" id="rroLabel" class="grow" placeholder="Etichetta" maxlength="100">
      <input type="text" id="rroEmoji" placeholder="Emoji" maxlength="50" style="max-width:7rem">
      <button class="btn btn-primary btn-sm" id="rroAdd">➕ Aggiungi</button>
    </div>`;
}

function customLockdown() {
  const st = ((S.detail.modules || {}).lockdown) || {};
  if (!st.active) return '<div class="empty">Nessun lockdown attivo. Si attiva solo con /lockdown on nel server.</div>';
  return `<table class="tbl"><tbody>
    <tr><td><b>Stato</b></td><td>🔒 ATTIVO su ${st.channelCount ?? '?'} canali</td></tr>
    ${st.motivo ? `<tr><td><b>Motivo</b></td><td>${esc(st.motivo)}</td></tr>` : ''}
    ${st.byTag ? `<tr><td><b>Di</b></td><td>${esc(st.byTag)}</td></tr>` : ''}
    ${st.at ? `<tr><td><b>Dal</b></td><td class="mono">${esc(st.at)}</td></tr>` : ''}
    </tbody></table>
    <p class="help">Sola lettura: per disattivarlo usa /lockdown off nel server.</p>`;
}

function customWarns() {
  const list = ((S.detail.lists || {}).warnRules) || [];
  const rows = list.map((t) => `<tr><td><b>${t.warns}</b> warn</td><td class="mono">${esc(t.action)}${t.action === 'timeout' ? ` ${t.minutes}m` : ''}</td>
    <td><button class="icon-btn danger" data-wn-del="${t.warns}">🗑️</button></td></tr>`).join('');
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length} regole</span></div>
    <table class="tbl"><thead><tr><th>Soglia</th><th>Azione</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">Nessuna regola: stesse di /warnazioni.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <input type="number" id="wnWarns" min="2" max="20" placeholder="Warn" style="max-width:7rem">
      <select id="wnAction"><option value="timeout">timeout</option><option value="kick">kick</option><option value="ban">ban</option></select>
      <input type="number" id="wnMinutes" min="1" max="40320" placeholder="Minuti" style="max-width:8rem">
      <button class="btn btn-primary btn-sm" id="wnAdd">➕ Aggiungi</button>
    </div>`;
}

function customYT() {
  const list = ((S.detail.lists || {}).youtube) || [];
  const rows = list.map((t) => `<tr><td class="mono">${esc(t.channelId)}</td><td class="mono">&lt;#${esc(t.announceId)}&gt;</td>
    <td><button class="icon-btn danger" data-yt-del="${esc(t.channelId)}">🗑️</button></td></tr>`).join('');
  const channels = (S.meta.channels || []).filter((c) => c.type === 0 || c.type === 'GUILD_TEXT' || c.type == null);
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length}/10 feed</span></div>
    <table class="tbl"><thead><tr><th>Canale YT</th><th>Annunci in</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">Nessun feed.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <input type="text" id="ytChannel" class="grow" placeholder="ID canale (UC…) o URL" maxlength="120">
      <select id="ytAnnounce" class="grow">${channels.map((c) => `<option value="${esc(c.id)}">#${esc(c.name || c.id)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" id="ytAdd">➕ Aggiungi</button>
    </div>`;
}

function wireLists() {
  const reload = async () => { try { S.detail = await Api.detail(S.gid); } catch (e) { apiErr(e); } vConfigKeep(); };
  const arAdd = $('#arAdd');
  if (arAdd) arAdd.onclick = async () => {
    const match = $('#arMatch').value.trim(), response = $('#arResp').value.trim();
    if (!match || !response) return toast('Parola e risposta obbligatorie.', 'err');
    try { await Api.saveModule(S.gid, 'autoresponder', { action: 'add', match, response, mode: $('#arMode').value, caseSensitive: $('#arCase').checked }); toast('Trigger aggiunto ✅', 'ok'); await reload(); }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-ar-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'autoresponder', { action: 'remove', id: b.dataset.arDel }); toast('Trigger rimosso.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
  const ccAdd = $('#ccAdd');
  if (ccAdd) ccAdd.onclick = async () => {
    const name = $('#ccName').value.trim(), response = $('#ccResp').value.trim();
    if (!name || !response) return toast('Nome e risposta obbligatorie.', 'err');
    const editing = ccAdd.dataset.editing;
    try {
      await Api.saveModule(S.gid, 'commands', editing ? { action: 'update', name, response } : { action: 'create', name, response });
      toast(editing ? 'Comando aggiornato ✅' : 'Comando creato ✅', 'ok');
      await reload();
    }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-cc-edit]').forEach((b) => {
    b.onclick = () => {
      const items = ((S.detail.lists || {}).customCommands) || [];
      const it = items.find((t) => t.name === b.dataset.ccEdit);
      if (!it) return;
      $('#ccName').value = it.name;
      $('#ccResp').value = it.response || '';
      const add = $('#ccAdd');
      add.dataset.editing = it.name;
      add.textContent = `💾 Salva !${it.name}`;
      $('#ccName').disabled = true;
    };
  });
  document.querySelectorAll('[data-cc-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'commands', { action: 'remove', name: b.dataset.ccDel }); toast('Comando rimosso.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
  const rwAdd = $('#rwAdd');
  if (rwAdd) rwAdd.onclick = async () => {
    const level = Number($('#rwLevel').value), roleId = $('#rwRole').value;
    if (!level) return toast('Livello non valido.', 'err');
    try { await Api.saveModule(S.gid, 'rewards', { action: 'set', level, roleId }); toast('Ricompensa salvata ✅', 'ok'); await reload(); }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-rw-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'rewards', { action: 'remove', level: Number(b.dataset.rwDel) }); toast('Ricompensa rimossa.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
  const shAdd = $('#shAdd');
  if (shAdd) shAdd.onclick = async () => {
    const roleId = $('#shRole').value, price = Number($('#shPrice').value);
    if (!roleId || !price) return toast('Ruolo e prezzo obbligatori.', 'err');
    try { await Api.saveModule(S.gid, 'shop', { action: 'set', roleId, price }); toast('Articolo aggiunto ✅', 'ok'); await reload(); }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-sh-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'shop', { action: 'remove', roleId: b.dataset.shDel }); toast('Articolo rimosso.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
  const rroAdd = $('#rroAdd');
  if (rroAdd) rroAdd.onclick = async () => {
    const roleId = $('#rroRole').value;
    if (!roleId) return toast('Scegli un ruolo.', 'err');
    try {
      await Api.saveModule(S.gid, 'reactionRoles', { action: 'add-option', roleId, label: $('#rroLabel').value.trim(), emoji: $('#rroEmoji').value.trim() });
      toast('Opzione aggiunta ✅', 'ok'); await reload();
    } catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-rro-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'reactionRoles', { action: 'remove-option', roleId: b.dataset.rroDel }); toast('Opzione rimossa.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
  const wnAdd = $('#wnAdd');
  if (wnAdd) wnAdd.onclick = async () => {
    const warns = Number($('#wnWarns').value), ruleAction = $('#wnAction').value, minutes = Number($('#wnMinutes').value);
    if (!warns) return toast('Soglia warn obbligatoria.', 'err');
    try { await Api.saveModule(S.gid, 'warns', { action: 'add', warns, ruleAction, minutes }); toast('Regola aggiunta ✅', 'ok'); await reload(); }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-wn-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'warns', { action: 'remove', warns: Number(b.dataset.wnDel) }); toast('Regola rimossa.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
  const ytAdd = $('#ytAdd');
  if (ytAdd) ytAdd.onclick = async () => {
    const channelId = $('#ytChannel').value.trim(), announceId = $('#ytAnnounce').value;
    if (!channelId || !announceId) return toast('Canale YT e canale annunci obbligatori.', 'err');
    try { await Api.saveModule(S.gid, 'youtube', { action: 'add', channelId, announceId }); toast('Feed aggiunto ✅', 'ok'); await reload(); }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-yt-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.saveModule(S.gid, 'youtube', { action: 'remove', channelId: b.dataset.ytDel }); toast('Feed rimosso.', 'ok'); await reload(); }
      catch (e) { apiErr(e); }
    };
  });
}

function vConfigKeep() {
  if (S.route === 'moduli' && S.selectedMod) vModuleDetail(S.selectedMod);
  else if (S.route === 'moduli') vModules();
}

/* ---------------- PERMESSI ---------------- */

function vPerms() {
  const perms = (S.detail && S.detail.perms) || {};
  const entries = Object.entries(perms);
  const ctl = Array.isArray(S.detail.controller) ? S.detail.controller : [];
  const allCmds = [...new Set(ctl.flatMap((m) => m.commands || []))].sort();
  $('#view').innerHTML = topbar('🔐 Permessi comandi', 'Max 5 ruoli per comando · vuoto = reset') +
    `<div class="form-card"><h3>➕ Imposta permessi</h3>
      <div class="row-flex">
        <select id="pmCmd" class="grow">${allCmds.map((c) => `<option value="${esc(c)}">/${esc(c)}</option>`).join('')}</select>
        <select id="pmRoles" multiple size="5" class="grow">${(S.meta.roles || []).filter((r) => !r.managed && r.id !== S.gid).map((r) => `<option value="${esc(r.id)}">@${esc(r.name)}</option>`).join('')}</select>
        <button class="btn btn-primary btn-sm" id="pmSave">💾 Salva</button>
      </div><div class="help" style="color:var(--text-dim);font-size:.8rem;margin-top:.4rem;">Solo i ruoli scelti potranno usare il comando.</div></div>
    <div class="form-card"><h3>📋 Override attivi (${entries.length})</h3>
      ${entries.length ? `<table class="tbl"><thead><tr><th>Comando</th><th>Ruoli</th><th></th></tr></thead><tbody>` +
        entries.map(([cmd, roles]) => `<tr><td class="mono">/${esc(cmd)}</td><td>${(Array.isArray(roles) ? roles : []).map((r) => `<span class="badge">${esc(roleName(r))}</span>`).join(' ')}</td>
        <td><button class="icon-btn danger" data-pm-del="${esc(cmd)}">reset</button></td></tr>`).join('') + `</tbody></table>`
      : '<div class="empty">Nessun override: valgono i permessi Discord.</div>'}
    </div>`;
  $('#pmSave').onclick = async () => {
    const command = $('#pmCmd').value;
    const roleIds = [...$('#pmRoles').selectedOptions].map((o) => o.value);
    if (!roleIds.length) return toast('Seleziona almeno un ruolo (per resettare usa “reset”).', 'err');
    try { await Api.perms(S.gid, { command, roleIds }); toast(`Permessi /${command} salvati ✅`, 'ok'); S.detail = await Api.detail(S.gid); vPerms(); }
    catch (e) { apiErr(e); }
  };
  document.querySelectorAll('[data-pm-del]').forEach((b) => {
    b.onclick = async () => {
      try { await Api.perms(S.gid, { command: b.dataset.pmDel, roleIds: [] }); toast('Permessi resettati.', 'ok'); S.detail = await Api.detail(S.gid); vPerms(); }
      catch (e) { apiErr(e); }
    };
  });
}

function roleName(id) {
  const r = (S.meta.roles || []).find((x) => String(x.id) === String(id));
  return r ? '@' + r.name : id;
}

/* ---------------- AUDIT ---------------- */

function vAudit() {
  $('#view').innerHTML = topbar('🧾 Audit log', 'Chi ha cambiato cosa · retention 90 giorni') + '<div class="skel"></div>';
  Api.audit(S.gid).then((rows) => {
    const list = Array.isArray(rows) ? rows : (rows && rows.entries) || [];
    $('#view').innerHTML = topbar('🧾 Audit log', `${list.length} eventi recenti`) +
      (list.length ? `<div class="form-card"><table class="tbl"><thead><tr><th>Quando</th><th>Modulo</th><th>Attore</th><th>Chiavi</th></tr></thead><tbody>` +
        list.slice().reverse().map((e) => `<tr><td class="mono">${esc((e.ts || '').slice(0, 16).replace('T', ' '))}</td>
        <td><span class="badge">${esc(e.module || '?')}</span></td><td class="mono">${esc(e.actor || '?')}</td>
        <td class="mono" style="font-size:.78rem;">${esc(Object.keys(e.keys || {}).join(', '))}</td></tr>`).join('') + `</tbody></table></div>`
      : '<div class="empty">Nessun evento registrato.</div>');
  }).catch((e) => apiErr(e));
}

/* ---------------- DIAGNOSTICA ---------------- */

function vDiag() {
  $('#view').innerHTML = topbar('🩺 Diagnostica', 'Perché qualcosa non carica? Risposta qui sotto') + '<div class="skel"></div>';
  Api.diag(S.gid).then((dg) => {
    const ok = (v) => v
      ? '<span class="badge on">ok</span>'
      : '<span class="badge err">KO</span>';
    const dbRows = Object.entries(dg.dbOk || {}).map(([k, v]) =>
      `<tr><td class="mono">${esc(k)}</td><td>${ok(v)}</td></tr>`).join('');
    const tips = [];
    if (!dg.tokenOk) tips.push('🔑 Token Discord non valido: il bot non legge canali/ruoli via REST.');
    if (!dg.guildsOk) tips.push('👥 Roster assente: il bot non ha ancora scritto la presenza (avvia prima il bot).');
    if (!dg.botPresent) tips.push('🤖 Bot non nel server: invitalo per gestire moduli e config.');
    if (!dg.canManage) tips.push('👑 Non hai Gestisci Server qui: le modifiche sono bloccate.');
    $('#view').innerHTML = topbar('🩺 Diagnostica', 'I semafori dicono tutto') +
      (tips.length
        ? `<div class="form-card"><h3>🛠️ Da sistemare</h3>${tips.map((t) => `<p style="margin:.4rem 0;">${t}</p>`).join('')}</div>`
        : `<div class="form-card"><h3>✅ Tutto verde</h3><p style="color:var(--text-secondary);margin:.2rem 0;">Se qualcosa non carica comunque, ricarica o riaccedi.</p></div>`) +
      `<div class="grid-3" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));display:grid;gap:1rem;margin-bottom:1.2rem;">
        <div class="card"><h3>Connessione</h3><p>Token: ${ok(dg.tokenOk)} · Roster: ${ok(dg.guildsOk)}</p></div>
        <div class="card"><h3>Server</h3><p>Bot dentro: ${ok(dg.botPresent)} · Gestisci: ${ok(dg.canManage)}</p></div>
        <div class="card"><h3>Conteggi</h3><p class="mono" style="font-size:.85rem;">👥 ${dg.counts?.members ?? '—'} · #${dg.counts?.channels ?? '—'} · 👑 ${dg.counts?.roles ?? '—'}</p></div>
      </div>
      <div class="form-card"><h3>🗄️ Moduli database</h3>
        <table class="tbl"><thead><tr><th>Modulo</th><th>Stato</th></tr></thead><tbody>${dbRows || '<tr><td colspan="2">—</td></tr>'}</tbody></table>
      </div>`;
  }).catch((e) => apiErr(e));
}

/* ---------------- COMMAND PALETTE ---------------- */

function cmdkKeys(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCmdk();
  }
  if (e.key === 'Escape') closeCmdk();
}

function cmdkItems() {
  const items = NAV.map(([id, ico, label]) => ({ ico, label: 'Vai a ' + label, run: () => go(id) }));
  const ctl = Array.isArray(S.detail && S.detail.controller) ? S.detail.controller : [];
  for (const m of ctl.slice(0, 30)) {
    items.push({
      ico: m.enabled ? '🟢' : '⚪',
      label: `${m.enabled ? 'Spegni' : 'Accendi'} ${m.title || m.id}`,
      run: async () => {
        try { await Api.toggle(S.gid, m.id, !m.enabled); toast(`${m.id} aggiornato ✅`, 'ok'); await refreshController(); }
        catch (e) { apiErr(e); }
      },
    });
  }
  return items;
}

function openCmdk() {
  closeCmdk();
  const mount = $('#cmdkMount');
  const back = document.createElement('div');
  back.className = 'cmdk-back';
  back.id = 'cmdkBack';
  back.innerHTML = `<div class="cmdk"><input id="cmdkIn" placeholder="Cerca azioni… (moduli, viste)" autocomplete="off"><div class="cmdk-list" id="cmdkList"></div></div>`;
  mount.appendChild(back);
  back.addEventListener('mousedown', (e) => { if (e.target === back) closeCmdk(); });
  const input = $('#cmdkIn');
  const draw = () => {
    const q = input.value.toLowerCase();
    const items = cmdkItems().filter((i) => i.label.toLowerCase().includes(q)).slice(0, 12);
    $('#cmdkList').innerHTML = items.map((_, i) => `<div class="cmdk-item${i === 0 ? ' sel' : ''}" data-i="${i}"><span>${items[i].ico}</span>${esc(items[i].label)}</div>`).join('') || '<div class="empty">Niente.</div>';
    document.querySelectorAll('.cmdk-item').forEach((el) => {
      el.onclick = () => { const it = items[Number(el.dataset.i)]; closeCmdk(); if (it) it.run(); };
    });
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') { const it = items[0]; closeCmdk(); if (it) it.run(); }
    };
  };
  input.oninput = draw;
  draw();
  setTimeout(() => input.focus(), 30);
}

function closeCmdk() {
  const b = $('#cmdkBack');
  if (b) b.remove();
}
