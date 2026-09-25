/* app.js — Mission Control. Viste: panoramica, moduli, configurazione, permessi, audit. */
'use strict';

const S = {
  me: null, guilds: [], gid: null, detail: null, schema: [], meta: { channels: [], roles: [] },
  route: 'panoramica', charts: [],
};

const NAV = [
  ['panoramica', '📊', 'Panoramica'],
  ['moduli', '🧩', 'Moduli'],
  ['config', '⚙️', 'Configurazione'],
  ['permessi', '🔐', 'Permessi'],
  ['audit', '🧾', 'Audit'],
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
    if (mb && S.me) mb.textContent = '@' + (S.me.username || '?');
  } catch (e) { return apiErr(e); }
  try {
    const g = await Api.guilds();
    S.guilds = Array.isArray(g.guilds) ? g.guilds : (Array.isArray(g) ? g : []);
  } catch (e) { return apiErr(e); }
  const hashGid = (location.hash.match(/gid=([0-9]+)/) || [])[1];
  const manageable = S.guilds.filter((x) => x && (x.canManage || x.botPresent));
  const pick = S.guilds.find((x) => x && x.id === hashGid) || manageable[0] || S.guilds[0];
  renderGuildSel();
  if (!pick) {
    $('#view').innerHTML = '<div class="empty">Nessun server gestibile. Invita il bot e torna qui.</div>';
    return;
  }
  await selectGuild(pick.id);
  window.addEventListener('hashchange', onHash);
  document.addEventListener('keydown', cmdkKeys);
}

function renderGuildSel() {
  const sel = $('#guildSel');
  sel.innerHTML = S.guilds.map((g) =>
    `<option value="${esc(g.id)}"${g.id === S.gid ? ' selected' : ''}>${esc(g.name || g.id)}${g.botPresent ? '' : ' (bot assente)'}</option>`
  ).join('');
  sel.onchange = () => selectGuild(sel.value);
}

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
  } catch (e) { return apiErr(e); }
  renderNav();
  onHash();
}

function onHash() {
  const r = (location.hash.match(/view=([a-z]+)/) || [])[1];
  S.route = NAV.some((n) => n[0] === r) ? r : 'panoramica';
  renderNav();
  ({ panoramica: vOverview, moduli: vModules, config: vConfig, permessi: vPerms, audit: vAudit })[S.route]();
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
  $('#view').innerHTML = topbar(`📊 ${esc(guildName())}`, 'Stato live dal Commander') + `
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
  const ctl = Array.isArray(S.detail.controller) ? S.detail.controller : [];
  $('#view').innerHTML = topbar('🧩 Moduli', `${ctl.length} moduli · toggle istantaneo via Commander`) +
    `<div class="mod-grid">` + ctl.map((m) => `
      <div class="mod${m.enabled && !m.isolated ? '' : ' off'}" data-mod="${esc(m.id)}">
        <div class="mod-head">
          <span class="ico">${esc(m.icon || '🧩')}</span>
          <div><h3>${esc(m.title || m.id)}</h3><span class="ver mono">v${esc(m.version || '?')} · ${esc(m.commands ?? 0)} cmd</span></div>
        </div>
        <p class="desc">${esc(m.description || '')}</p>
        <div class="mod-foot">
          <label class="switch" title="on/off"><input type="checkbox" data-toggle="${esc(m.id)}"${m.enabled ? ' checked' : ''} ${m.locked ? ' disabled' : ''}><span class="tr"></span></label>
          ${m.locked ? '<span class="badge">🔒 sistema</span>' : modBadge(m)}
        </div>
      </div>`).join('') + `</div>`;
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

async function refreshController() {
  try {
    const d = await Api.detail(S.gid);
    S.detail = d;
    if (S.route === 'moduli') vModules();
  } catch (e) { apiErr(e); }
}

/* ---------------- CONFIGURAZIONE (schema-driven) ---------------- */

function fieldInput(mod, f, cur) {
  const val = cur != null ? cur : '';
  const name = `f_${mod}_${f.key}`;
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  switch (f.type) {
    case 'bool':
      return `<label class="check-row"><input type="checkbox" data-fkey="${esc(f.key)}"${val ? ' checked' : ''}> ${esc(f.label)}${help}</label>`;
    case 'number':
      return `<div class="field"><label>${esc(f.label)}</label><input type="number" data-fkey="${esc(f.key)}" value="${esc(val)}">${help}</div>`;
    case 'text':
      return `<div class="field"><label>${esc(f.label)}</label>` +
        (f.multiline ? `<textarea data-fkey="${esc(f.key)}"${ph}>${esc(val)}</textarea>` : `<input type="text" data-fkey="${esc(f.key)}" value="${esc(val)}"${ph}>`) + `${help}</div>`;
    case 'channel': {
      const chs = (S.meta.channels || []).filter((c) => c.type === 0 || c.type === 'GUILD_TEXT' || c.type == null);
      const opts = `<option value="">— nessuno —</option>` + chs.map((c) => `<option value="${esc(c.id)}"${String(val) === String(c.id) ? ' selected' : ''}>#${esc(c.name || c.id)}</option>`).join('');
      return `<div class="field"><label>${esc(f.label)}</label><select data-fkey="${esc(f.key)}">${opts}</select>${help}</div>`;
    }
    case 'roles': {
      const roles = (S.meta.roles || []).filter((r) => !r.managed && r.id !== S.gid);
      const curArr = Array.isArray(val) ? val.map(String) : [];
      const opts = roles.map((r) => `<option value="${esc(r.id)}"${curArr.includes(String(r.id)) ? ' selected' : ''}>@${esc(r.name)}</option>`).join('');
      return `<div class="field"><label>${esc(f.label)}</label><select multiple size="5" data-fkey="${esc(f.key)}">${opts}</select>${help}</div>`;
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

function vConfig() {
  const schema = S.schema;
  const mods = (S.detail && S.detail.modules) || {};
  const sections = [];
  const seen = new Set();
  for (const s of schema) {
    const sec = s.section || 'Altro';
    if (!seen.has(sec)) { seen.add(sec); sections.push(sec); }
  }
  $('#view').innerHTML = topbar('⚙️ Configurazione', 'Ogni sezione salva solo i suoi campi') +
    `<div class="tabs">${sections.map((s, i) => `<button data-sec="${esc(s)}" class="${i === 0 ? 'active' : ''}">${esc(s)}</button>`).join('')}</div>
     <div id="cfgBody"></div>`;
  const render = (sec) => {
    document.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('active', b.dataset.sec === sec));
    const cards = schema.filter((s) => (s.section || 'Altro') === sec).map((s) => {
      const cur = (mods[s.module] && typeof mods[s.module] === 'object') ? mods[s.module] : {};
      let inner = '';
      if (Array.isArray(s.fields) && s.fields.length) {
        inner = s.fields.map((f) => fieldInput(s.module, f, cur[f.key])).join('') +
          `<button class="btn btn-primary btn-sm" data-save="${esc(s.module)}">💾 Salva ${esc(s.title)}</button>`;
      }
      if (s.custom === 'autoresponder') inner += customAutoresponder(cur);
      if (s.custom === 'commands') inner += customCommands(cur);
      if (s.custom === 'rewards') inner += customRewards(cur);
      if (!inner) inner = '<div class="empty">Nessun campo: si gestisce da Discord o pannello dedicato.</div>';
      return `<div class="form-card"><h3>${esc(s.icon || '⚙️')} ${esc(s.title)}</h3><p class="fdesc">${esc(s.description || '')}</p>${inner}</div>`;
    }).join('');
    $('#cfgBody').innerHTML = cards || '<div class="empty">Niente qui.</div>';
    wireConfig();
  };
  document.querySelectorAll('[data-sec]').forEach((b) => { b.onclick = () => render(b.dataset.sec); });
  render(sections[0]);
}

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
  wireLists();
}

/* ---- pannelli custom: autoresponder / commands / rewards ---- */

function customAutoresponder() {
  const list = ((S.detail.lists || {}).autoresponder) || [];
  const rows = list.map((t) => `<tr><td class="mono">${esc(t.match || t.id || '?')}</td><td>${esc((t.response || '').slice(0, 90))}</td>
    <td class="mono">${esc(t.mode || '')}</td><td><button class="icon-btn danger" data-ar-del="${esc(t.id)}">🗑️</button></td></tr>`).join('');
  return `<div class="row-flex" style="margin:.6rem 0"><span class="badge">${list.length} trigger</span></div>
    <table class="tbl"><thead><tr><th>Trigger</th><th>Risposta</th><th>Modo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">Nessun trigger.</td></tr>'}</tbody></table>
    <div class="row-flex" style="margin-top:.7rem">
      <input type="text" id="arMatch" class="grow" placeholder="Parola trigger…" maxlength="200">
      <input type="text" id="arResp" class="grow" placeholder="Risposta…" maxlength="1500">
      <button class="btn btn-primary btn-sm" id="arAdd">➕ Aggiungi</button>
    </div>`;
}

function customCommands() {
  const list = ((S.detail.lists || {}).customCommands) || [];
  const rows = list.map((t) => `<tr><td class="mono">!${esc(t.name || '?')}</td><td>${esc((t.response || '').slice(0, 90))}</td>
    <td class="mono">${t.uses ?? ''}</td><td><button class="icon-btn danger" data-cc-del="${esc(t.name)}">🗑️</button></td></tr>`).join('');
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

function wireLists() {
  const reload = async () => { try { S.detail = await Api.detail(S.gid); } catch (e) { apiErr(e); } vConfigKeep(); };
  const arAdd = $('#arAdd');
  if (arAdd) arAdd.onclick = async () => {
    const match = $('#arMatch').value.trim(), response = $('#arResp').value.trim();
    if (!match || !response) return toast('Parola e risposta obbligatorie.', 'err');
    try { await Api.saveModule(S.gid, 'autoresponder', { action: 'add', match, response }); toast('Trigger aggiunto ✅', 'ok'); await reload(); }
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
    try { await Api.saveModule(S.gid, 'commands', { action: 'create', name, response }); toast('Comando creato ✅', 'ok'); await reload(); }
    catch (e) { apiErr(e); }
  };
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
}

function vConfigKeep() {
  const sec = (document.querySelector('.tabs button.active') || {}).dataset;
  vConfig();
  if (sec && sec.sec) {
    const b = document.querySelector(`[data-sec="${CSS.escape(sec.sec)}"]`);
    if (b) b.click();
  }
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
