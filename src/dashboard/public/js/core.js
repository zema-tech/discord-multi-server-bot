(function () {
'use strict';

var Dash = window.Dash = window.Dash || {};

Dash.state = Dash.state || {};
var S = Dash.state;
if (S.gid === undefined) S.gid = null;
if (!Array.isArray(S.guilds)) S.guilds = [];
if (S.filter === undefined) S.filter = 'all';
if (S.search === undefined) S.search = '';
if (!S.meta) S.meta = { channels: [], roles: [] };
if (!S.meta.channels) S.meta.channels = [];
if (!S.meta.roles) S.meta.roles = [];
if (!S.modulesCache) S.modulesCache = {};
if (!S.listsCache) S.listsCache = { autoresponder: [], customCommands: [], levelRewards: [], shop: [], rrOptions: [] };
if (!Array.isArray(S.schema)) S.schema = [];
if (S.entry === undefined) S.entry = null;
if (S.activeModule === undefined) S.activeModule = null;
if (S.moduleSection === undefined) S.moduleSection = 'all';
if (S.modSearch === undefined) S.modSearch = '';
if (!S.baseline) S.baseline = {};
if (!S.pending) S.pending = {};
if (!S.dirtyModules) S.dirtyModules = {};
if (!S.permsBaseline) S.permsBaseline = {};
if (!S.permsDraft) S.permsDraft = {};
if (!S.dirtyPerms) S.dirtyPerms = {};
if (!Array.isArray(S.trends)) S.trends = [];
if (!Array.isArray(S.controller)) S.controller = [];
if (S.apiMs === undefined) S.apiMs = null;
if (S.editingCmd === undefined) S.editingCmd = null;

function $(sel, root) {
  if (sel === null || sel === undefined) return null;
  if (typeof sel !== 'string') return sel;
  try {
    var r = root || document;
    if (sel.charAt(0) !== '#' && sel.charAt(0) !== '.' && sel.indexOf(' ') === -1 && sel.indexOf('[') === -1 && sel.indexOf('>') === -1) {
      var byId = document.getElementById(sel);
      if (byId) return byId;
    }
    return r.querySelector(sel);
  } catch (e) {
    try { return document.getElementById(sel); } catch (_) { return null; }
  }
}

function clear(el) {
  var node = typeof el === 'string' ? $(el) : el;
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function toast(msg, kind) {
  try {
    var wrap = document.getElementById('toasts');
    if (!wrap) return;
    var k = kind === 'ok' ? 'ok' : (kind === 'err' ? 'err' : 'info');
    while (wrap.children.length >= 4) wrap.removeChild(wrap.firstChild);
    var box = document.createElement('div');
    box.className = 'toast ' + k;
    box.setAttribute('role', 'status');
    var txt = document.createElement('span');
    txt.className = 'toast-msg';
    txt.textContent = String(msg === undefined || msg === null ? '' : msg);
    box.appendChild(txt);
    var bar = document.createElement('div');
    bar.className = 'toast-bar';
    var fill = document.createElement('span');
    bar.appendChild(fill);
    box.appendChild(bar);
    var done = false;
    var dismiss = function () {
      if (done) return;
      done = true;
      try { box.classList.add('out'); } catch (_) {}
      window.setTimeout(function () {
        try { if (box.parentNode === wrap) wrap.removeChild(box); } catch (_) {}
      }, 280);
    };
    box.addEventListener('click', dismiss);
    wrap.appendChild(box);
    window.setTimeout(dismiss, 4500);
  } catch (_) {}
}

function goLogin() {
  try { window.location.href = '/login'; } catch (_) {}
}

function needLogin(body) {
  try { return !!(body && body.relogin === true); } catch (_) { return false; }
}

function checkAuth(res) {
  try {
    if (!res) return true;
    var st = typeof res === 'number' ? res : res.status;
    if (st === 401) { goLogin(); return false; }
  } catch (_) {}
  return true;
}

async function errorBody(res, fallback) {
  var fb = fallback || 'Operazione fallita.';
  if (!res) return fb;
  try {
    var data = await res.json();
    if (data) {
      if (typeof data.errore === 'string' && data.errore) return data.errore + ' (HTTP ' + res.status + ')';
      if (typeof data.error === 'string' && data.error) return data.error + ' (HTTP ' + res.status + ')';
      if (typeof data.message === 'string' && data.message) return data.message + ' (HTTP ' + res.status + ')';
    }
  } catch (_) {}
  try { return fb + ' (HTTP ' + res.status + ')'; } catch (_) { return fb; }
}

async function failWith(res, fallback) {
  var m = await errorBody(res, fallback);
  var e = new Error(m);
  try { e.status = res.status; } catch (_) {}
  try { checkAuth(res); } catch (_) {}
  throw e;
}

async function getJSON(url) {
  var t0 = Date.now();
  var res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  try { S.apiMs = Date.now() - t0; } catch (_) {}
  try { refreshStatus(); } catch (_) {}
  if (!res.ok) {
    if (res.status === 401) goLogin();
    throw await failWith(res, 'Richiesta fallita.');
  }
  var data = await res.json();
  if (needLogin(data)) { goLogin(); throw new Error('Sessione scaduta: rieffettua il login.'); }
  return data;
}

async function putJSON(url, body) {
  var t0 = Date.now();
  var res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {}) });
  try { S.apiMs = Date.now() - t0; } catch (_) {}
  try { refreshStatus(); } catch (_) {}
  if (!res.ok) {
    if (res.status === 401) goLogin();
    throw await failWith(res, 'Salvataggio fallito.');
  }
  var data = await res.json();
  if (needLogin(data)) { goLogin(); throw new Error('Sessione scaduta: rieffettua il login.'); }
  return data;
}

function putModule(modName,body){ return putJSON("/api/guilds/"+encodeURIComponent(Dash.state.gid)+"/modules/"+encodeURIComponent(modName), body); }

function initials(name) {
  try {
    var s = String(name || '').trim();
    if (!s) return '?';
    var parts = s.split(/\s+/);
    var out = '';
    for (var i = 0; i < parts.length && out.length < 2; i++) {
      if (parts[i]) out += parts[i].charAt(0).toUpperCase();
    }
    return out || '?';
  } catch (_) { return '?'; }
}

function fmtNum(n) {
  try {
    if (n === null || n === undefined || n === '') return '0';
    var v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    return v.toLocaleString('it-IT');
  } catch (_) { return String(n); }
}

function fmtCompact(n) {
  try {
    var v = Number(n || 0);
    if (!Number.isFinite(v)) return String(n);
    try {
      return new Intl.NumberFormat('it', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    } catch (_) {}
    if (Math.abs(v) >= 1000000) return (v / 1000000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'M';
    if (Math.abs(v) >= 1000) return (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k';
    return String(v);
  } catch (_) { return String(n); }
}

function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

function animateValue(el, n) {
  var node = typeof el === 'string' ? $(el) : el;
  if (!node) return;
  var target = Number(n || 0);
  if (!Number.isFinite(target)) target = 0;
  if (prefersReduced()) { node.textContent = fmtNum(target); return; }
  try {
    var from = 0;
    try {
      var cur = String(node.textContent || '0').replace(/[^\d-]/g, '');
      from = Number(cur || 0) || 0;
    } catch (_) { from = 0; }
    if (from === target) { node.textContent = fmtNum(target); return; }
    var t0 = null;
    var dur = 500;
    var step = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(from + (target - from) * eased);
      node.textContent = fmtNum(val);
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = fmtNum(target);
    };
    requestAnimationFrame(step);
  } catch (_) {
    try { node.textContent = fmtNum(target); } catch (_) {}
  }
}

function skeletonLine(w) {
  var d = document.createElement('div');
  d.className = 'skeleton';
  try { d.style.width = w || '100%'; } catch (_) {}
  return d;
}

function setSaving(btn, on) {
  var node = typeof btn === 'string' ? $(btn) : btn;
  if (!node) return;
  try {
    if (on) {
      if (node.dataset.orig === undefined) node.dataset.orig = node.textContent;
      node.disabled = true;
      node.textContent = 'Attendi…';
      node.setAttribute('aria-busy', 'true');
    } else {
      node.disabled = false;
      if (node.dataset.orig !== undefined) node.textContent = node.dataset.orig;
      try { delete node.dataset.orig; } catch (_) {}
      node.removeAttribute('aria-busy');
    }
  } catch (_) {}
}

var confirmResolver = null;
var confirmInit = false;

function closeConfirm(val) {
  try {
    var bd = document.getElementById('confirm-backdrop');
    if (bd) bd.hidden = true;
  } catch (_) {}
  var r = confirmResolver;
  confirmResolver = null;
  if (typeof r === 'function') {
    try { r(val); } catch (_) {}
  }
}

function openConfirm(title, msg) {
  try {
    var t = document.getElementById('confirm-title');
    if (t) t.textContent = title || 'Confermi?';
    var m = document.getElementById('confirm-msg');
    if (m) m.textContent = msg || '';
    var bd = document.getElementById('confirm-backdrop');
    if (bd) bd.hidden = false;
    var ok = document.getElementById('confirm-ok');
    if (ok && ok.focus) { try { ok.focus(); } catch (_) {} }
  } catch (_) {}
  return new Promise(function (resolve) { confirmResolver = resolve; });
}

function initConfirm() {
  if (confirmInit) return;
  confirmInit = true;
  try {
    var ok = document.getElementById('confirm-ok');
    var cancel = document.getElementById('confirm-cancel');
    var bd = document.getElementById('confirm-backdrop');
    if (ok) ok.addEventListener('click', function () { closeConfirm(true); });
    if (cancel) cancel.addEventListener('click', function () { closeConfirm(false); });
    if (bd) bd.addEventListener('click', function (e) { if (e.target === bd) closeConfirm(false); });
    document.addEventListener('keydown', function (e) {
      try {
        if (e.key === 'Escape' && bd && !bd.hidden) closeConfirm(false);
      } catch (_) {}
    });
  } catch (_) {}
}

function openNav() {
  try {
    document.body.classList.add('nav-open');
    var ov = document.getElementById('nav-overlay');
    if (ov) ov.hidden = false;
    var t = document.getElementById('nav-toggle');
    if (t) t.setAttribute('aria-expanded', 'true');
  } catch (_) {}
}

function closeNav() {
  try {
    document.body.classList.remove('nav-open');
    var ov = document.getElementById('nav-overlay');
    if (ov) ov.hidden = true;
    var t = document.getElementById('nav-toggle');
    if (t) t.setAttribute('aria-expanded', 'false');
  } catch (_) {}
}

var navInit = false;
function initNav() {
  if (navInit) return;
  navInit = true;
  try {
    var t = document.getElementById('nav-toggle');
    if (t) t.addEventListener('click', function () {
      try {
        if (document.body.classList.contains('nav-open')) closeNav();
        else openNav();
      } catch (_) {}
    });
    var ov = document.getElementById('nav-overlay');
    if (ov) ov.addEventListener('click', closeNav);
  } catch (_) {}
}

function readHashGid() {
  try {
    var h = window.location.hash || '';
    var m = h.match(/(\d{10,25})/);
    return m ? m[1] : null;
  } catch (_) { return null; }
}

function writeHashGid(gid) {
  try {
    if (!gid) {
      if ((window.location.hash || '').length > 0) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }
    var want = '#/guild/' + gid;
    if (window.location.hash !== want) window.location.hash = want;
  } catch (_) {}
}

var shortcutInit = false;
function initShortcut() {
  if (shortcutInit) return;
  shortcutInit = true;
  try {
    document.addEventListener('keydown', function (e) {
      try {
        if (!e || e.key !== '/') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var ae = document.activeElement;
        var tag = ae && ae.tagName ? String(ae.tagName).toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (ae && ae.isContentEditable) return;
        var bd = document.getElementById('confirm-backdrop');
        if (bd && !bd.hidden) return;
        var target = null;
        var vs = document.getElementById('view-server');
        if (vs && !vs.hidden) target = document.getElementById('module-search');
        if (!target) target = document.getElementById('guild-search');
        if (!target) target = document.getElementById('module-search');
        if (target && target.focus) { e.preventDefault(); target.focus(); }
      } catch (_) {}
    });
  } catch (_) {}
}

function setStatus(msg) {
  try {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  } catch (_) {}
}

function showViews(server) {
  try {
    var home = document.getElementById('view-home');
    var srv = document.getElementById('view-server');
    if (home) home.hidden = !!server;
    if (srv) srv.hidden = !server;
    if (!server) document.title = 'Pannello — Multi-Server Bot';
  } catch (_) {}
}

function setAvatar(target, url, name) {
  var el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  var label = name || '';
  try {
    if (el.tagName === 'IMG') {
      if (url) { el.src = url; el.alt = label || 'Avatar'; }
      else { el.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; el.alt = label || 'Avatar'; }
      return;
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    try { el.classList.remove('avatar-fb'); } catch (_) {}
    if (url) {
      var im = document.createElement('img');
      im.src = url;
      im.alt = label || '';
      im.addEventListener('error', function () {
        try {
          while (el.firstChild) el.removeChild(el.firstChild);
          try { el.classList.add('avatar-fb'); } catch (_) {}
          el.textContent = initials(label);
        } catch (_) {}
      });
      el.appendChild(im);
    } else {
      try { el.classList.add('avatar-fb'); } catch (_) {}
      el.textContent = initials(label);
    }
  } catch (_) {}
}

function renderCtx(guild, name, sub) {
  try {
    var gname = (typeof name === 'string' && name) ? name : ((guild && (guild.name || guild.title)) || 'I tuoi server');
    var ssub = (typeof sub === 'string') ? sub : '';
    var ci = document.getElementById('ctx-icon');
    var cn = document.getElementById('ctx-name');
    var cs = document.getElementById('ctx-sub');
    if (cn) cn.textContent = gname;
    if (cs) cs.textContent = ssub;
    if (ci) {
      var u = guild ? (guild.icon || guild.iconUrl || guild.avatarUrl || null) : null;
      setAvatar(ci, u, gname);
    }
    document.title = gname + ' — Multi-Server Bot';
  } catch (_) {}
}

async function loadMe() {
  var data = await getJSON("/api/me");
  try {
    var uname = (data && (data.username || data.name)) || 'Utente';
    var usub = (data && data.username) ? ('@' + data.username) : ((data && data.id) ? ('ID ' + data.id) : 'Account collegato');
    var un = document.getElementById('user-name');
    if (un) un.textContent = uname;
    var us = document.getElementById('user-sub');
    if (us) us.textContent = usub;
    var au = data && (data.avatarUrl || data.avatar);
    setAvatar(document.getElementById('user-avatar'), au, uname);
    setAvatar(document.getElementById('top-avatar'), au, uname);
  } catch (_) {}
  try { refreshStatus(); } catch (_) {}
  return data;
}

function refreshStatus() {
  try {
    var pill = document.getElementById('top-status');
    if (!pill) return;
    pill.hidden = false;
    var txt = null;
    try { txt = pill.querySelector('.status-txt') || pill; } catch (_) { txt = pill; }
    var ms = S.apiMs;
    if (ms !== null && ms !== undefined && Number.isFinite(Number(ms))) {
      txt.textContent = 'Online · ' + Math.round(Number(ms)) + ' ms';
    } else {
      txt.textContent = 'Online';
    }
  } catch (_) {}
}

var NUMBER_RANGES = { maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90], maxCapsPercent: [10, 100], threshold: [1, 100], delaySeconds: [0, 3600] };
var TEXT_LIMITS = { welcomeMessage: 500, goodbyeMessage: 500, systemPrompt: 1000, badWords: 1000, title: 100, description: 500 };
var NONE_VALUE = '__none__';
var PERM_COMMANDS = ['ban', 'kick', 'timeout', 'warn', 'clear', 'slowmode', 'lock', 'nuke', 'giveaway', 'poll', 'ticket', 'setup', 'embed', 'evento', 'template'];
var MODULE_ICONS = { general: 'sliders', welcome: 'flag', automod: 'shield', autorole: 'users', levels: 'star', rewards: 'award', tickets: 'ticket', ticketsPlus: 'ticket', tempvoice: 'mic', ai: 'cpu', aiPlus: 'cpu', starboard: 'star', confessioni: 'eye', autoresponder: 'message', commands: 'terminal', reactionRoles: 'check', lockdown: 'lock', shop: 'cart', logging: 'list', panoramica: 'chart', perms: 'lock' };

function roleName(id) {
  try {
    var roles = (S.meta && S.meta.roles) || [];
    for (var i = 0; i < roles.length; i++) {
      if (String(roles[i].id) === String(id)) return roles[i].name;
    }
  } catch (_) {}
  return 'Ruolo rimosso';
}

function normalizeLists(lists) {
  var out = { autoresponder: [], customCommands: [], levelRewards: [], shop: [], rrOptions: [] };
  try {
    var l = lists || {};
    if (Array.isArray(l.autoresponder)) out.autoresponder = l.autoresponder;
    if (Array.isArray(l.customCommands)) out.customCommands = l.customCommands;
    if (Array.isArray(l.levelRewards)) out.levelRewards = l.levelRewards;
    if (Array.isArray(l.shop)) out.shop = l.shop;
    if (Array.isArray(l.rrOptions)) out.rrOptions = l.rrOptions;
    else if (Array.isArray(l.reactionRoles)) out.rrOptions = l.reactionRoles;
  } catch (_) {}
  return out;
}

function normalizeTrends(t) {
  try {
    if (!Array.isArray(t)) return [];
    var rows = t.map(function (r) {
      return {
        date: r && r.date !== undefined ? r.date : null,
        messages: Number((r && r.messages) || 0) || 0,
        joins: Number((r && r.joins) || 0) || 0,
        leaves: Number((r && r.leaves) || 0) || 0
      };
    });
    return rows.slice(-30);
  } catch (_) { return []; }
}

function emptyBox(icon, title, hint, cta) {
  var ic = 'info';
  var ti = '';
  var hi = '';
  var cc = null;
  if (title === undefined && hint === undefined && cta === undefined) {
    if (typeof icon === 'string') { ti = icon; ic = 'info'; }
  } else {
    ic = icon || 'info';
    ti = title || '';
    hi = hint || '';
    cc = cta || null;
  }
  var box = document.createElement('div');
  box.className = 'empty-state';
  try {
    if (typeof Dash.iconEl === 'function' && typeof ic === 'string') {
      var ico = Dash.iconEl(ic);
      if (ico && ico.nodeType) box.appendChild(ico);
    }
  } catch (_) {}
  if (ti) {
    var strong = document.createElement('strong');
    strong.textContent = ti;
    box.appendChild(strong);
  }
  if (hi) {
    var p = document.createElement('p');
    p.className = 'muted';
    p.textContent = hi;
    box.appendChild(p);
  }
  if (Array.isArray(cc) && cc.length > 0) {
    var wrap = document.createElement('div');
    wrap.className = 'empty-cta';
    cc.forEach(function (c) {
      try {
        var a = document.createElement('a');
        a.className = 'btn btn-sm ' + (c && c.primary ? 'btn-primary' : 'btn-secondary');
        a.href = (c && c.href) || '#';
        a.textContent = (c && c.label) || 'Apri';
        wrap.appendChild(a);
      } catch (_) {}
    });
    box.appendChild(wrap);
  }
  return box;
}

function deleteBtn(label, fn) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn danger';
  try {
    b.setAttribute('aria-label', label || 'Elimina');
    b.setAttribute('title', label || 'Elimina');
  } catch (_) {}
  try {
    if (typeof Dash.iconEl === 'function') b.appendChild(Dash.iconEl('trash'));
    else b.textContent = label || 'Elimina';
  } catch (_) {}
  if (typeof fn === 'function') b.addEventListener('click', fn);
  return b;
}

function attachCounter(input, limit) {
  var node = typeof input === 'string' ? $(input) : input;
  var lim = Number(limit || 0) || 0;
  if (!node) return null;
  var counter = document.createElement('div');
  counter.className = 'char-counter muted small';
  var update = function () {
    try {
      var len = String(node.value || '').length;
      counter.textContent = lim > 0 ? (len + ' / ' + lim) : String(len);
    } catch (_) {}
  };
  try {
    if (node.parentNode) {
      if (node.nextSibling) node.parentNode.insertBefore(counter, node.nextSibling);
      else node.parentNode.appendChild(counter);
    }
    node.addEventListener('input', update);
    update();
  } catch (_) {}
  return counter;
}

function elNS(tag, attrs) {
  var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  try {
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) el.setAttribute(keys[i], attrs[keys[i]]);
    }
  } catch (_) {}
  return el;
}

function shortDay(iso) {
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm;
  } catch (_) { return String(iso || ''); }
}

function chartPath(pts) {
  try {
    if (!Array.isArray(pts) || pts.length === 0) return '';
    if (pts[0] !== null && typeof pts[0] === 'object' && pts[0].x !== undefined) {
      return pts.map(function (p, i) {
        var x = Number(p.x) || 0;
        var y = Number(p.y) || 0;
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');
    }
    var nums = pts.map(function (v) { return Number(v) || 0; });
    var w = 100;
    var h = 32;
    var max = 1;
    for (var i = 0; i < nums.length; i++) if (nums[i] > max) max = nums[i];
    var d = '';
    for (var j = 0; j < nums.length; j++) {
      var x = nums.length <= 1 ? w / 2 : (j * w) / (nums.length - 1);
      var y = (h - 2) - (nums[j] / max) * (h - 4);
      d += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    return d.trim();
  } catch (_) { return ''; }
}

function sumKey(rows, key) {
  var t = 0;
  try {
    var arr = rows || [];
    for (var i = 0; i < arr.length; i++) {
      var v = Number(arr[i] && arr[i][key]);
      if (Number.isFinite(v)) t += v;
    }
  } catch (_) {}
  return t;
}

function deltaLabel(a, b) {
  try {
    if (Array.isArray(a)) {
      var key = typeof b === 'string' ? b : 'messages';
      var rows = a;
      var cur = sumKey(rows.slice(-7), key);
      var prev = sumKey(rows.slice(-14, -7), key);
      return deltaLabel(cur, prev);
    }
    var curN = Number(a) || 0;
    var prevN = Number(b) || 0;
    if (prevN <= 0) return curN > 0 ? 'nuovo' : 'stabile';
    var pct = Math.round(((curN - prevN) / prevN) * 100);
    if (pct === 0) return 'stabile';
    return (pct > 0 ? '+' : '') + pct + '%';
  } catch (_) { return ''; }
}

function fillRoleSelect(selId) {
  var sel = typeof selId === 'string' ? $(selId) : selId;
  if (!sel) return null;
  try {
    clear(sel);
    var roles = ((S.meta && S.meta.roles) || []).filter(function (r) { return !r.managed; });
    if (roles.length === 0) {
      var o = document.createElement('option');
      o.value = '';
      o.textContent = 'Nessun ruolo disponibile';
      sel.appendChild(o);
      return sel;
    }
    roles.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
  } catch (_) {}
  return sel;
}

function insertVar(textarea, token) {
  var node = typeof textarea === 'string' ? $(textarea) : textarea;
  if (!node || typeof token !== 'string') return;
  try {
    var tok = token;
    if (typeof node.selectionStart === 'number') {
      var s = node.selectionStart || 0;
      var e = node.selectionEnd || 0;
      var v = node.value || '';
      node.value = v.slice(0, s) + tok + v.slice(e);
      var pos = s + tok.length;
      try { node.setSelectionRange(pos, pos); } catch (_) {}
    } else {
      node.value = (node.value || '') + tok;
    }
    if (node.focus) node.focus();
    try { node.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  } catch (_) {}
}

var dirtySet = new Set();
var dirty = {
  mark: function (k) { try { dirtySet.add(k); } catch (_) {} try { updateDirtyBar(); } catch (_) {} },
  unmark: function (k) { try { dirtySet.delete(k); } catch (_) {} try { updateDirtyBar(); } catch (_) {} },
  has: function (k) { try { return dirtySet.has(k); } catch (_) { return false; } },
  count: function () { try { return dirtySet.size; } catch (_) { return 0; } },
  all: function () { try { return Array.from(dirtySet); } catch (_) { return []; } },
  clear: function () { try { dirtySet.clear(); } catch (_) {} try { updateDirtyBar(); } catch (_) {} }
};

if (!Array.isArray(Dash.onSave)) Dash.onSave = [];
if (!Array.isArray(Dash.onDiscard)) Dash.onDiscard = [];

function updateDirtyBar() {
  try {
    var n = 0;
    try { n = dirty.count(); } catch (_) { n = 0; }
    try {
      var bar = document.getElementById('dirty-bar');
      if (bar) {
        bar.hidden = n === 0;
        var c = document.getElementById('dirty-count');
        if (c) c.textContent = n === 1 ? '1 modifica non salvata' : (n + ' modifiche non salvate');
      }
    } catch (_) {}
    try {
      var ps = document.getElementById('page-save');
      if (ps) {
        ps.hidden = n === 0;
        try { ps.disabled = n === 0; } catch (_) {}
        if (!ps.dataset.dirtyWired) {
          ps.dataset.dirtyWired = '1';
          ps.addEventListener('click', function () { saveAllDirty(); });
        }
      }
    } catch (_) {}
  } catch (_) {}
}

async function saveAllDirty() {
  var btn = null;
  try { btn = document.getElementById('dirty-save'); setSaving(btn, true); } catch (_) {}
  try {
    var fns = (Dash.onSave || []).slice();
    if (fns.length === 0) { toast('Nessuna modifica da salvare.'); return; }
    for (var i = 0; i < fns.length; i++) await fns[i]();
    toast('Modifiche salvate.', 'ok');
  } catch (e) {
    toast('Salvataggio fallito: ' + (e && e.message ? e.message : e), 'err');
  } finally {
    try { setSaving(btn, false); } catch (_) {}
    try { updateDirtyBar(); } catch (_) {}
    try { refreshStatus(); } catch (_) {}
  }
}

async function discardAllDirty() {
  try {
    var n = 0;
    try { n = dirty.count(); } catch (_) { n = 0; }
    if (n === 0) return;
    var ok = await openConfirm('Annullare le modifiche?', 'Le modifiche non salvate andranno perse.');
    if (!ok) return;
    var fns = (Dash.onDiscard || []).slice();
    for (var i = 0; i < fns.length; i++) await fns[i]();
    try { dirty.clear(); } catch (_) {}
    try { updateDirtyBar(); } catch (_) {}
    toast('Modifiche annullate.');
  } catch (_) {}
}

var dirtyBarInit = false;
function initDirtyBar() {
  if (dirtyBarInit) return;
  dirtyBarInit = true;
  try {
    var s = document.getElementById('dirty-save');
    if (s) s.addEventListener('click', function () { saveAllDirty(); });
    var d = document.getElementById('dirty-discard');
    if (d) d.addEventListener('click', function () { discardAllDirty(); });
    var ps = document.getElementById('page-save');
    if (ps && !ps.dataset.dirtyWired) {
      ps.dataset.dirtyWired = '1';
      ps.addEventListener('click', function () { saveAllDirty(); });
    }
    updateDirtyBar();
  } catch (_) {}
}

function clearBusy() {
  try {
    var ids = ['guild-list', 'stats', 'modules', 'module-detail', 'module-list'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.setAttribute('aria-busy', 'false');
    }
  } catch (_) {}
}

function setBusy() {
  try {
    var ids = ['guild-list', 'stats', 'modules', 'module-detail', 'module-list'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.setAttribute('aria-busy', 'true');
    }
  } catch (_) {}
}

async function selectGuild(gid, fallbackName) {
  if (!gid) return null;
  S.gid = gid;
  S.entry = null;
  S.activeModule = null;
  S.pending = {};
  S.baseline = {};
  S.dirtyModules = {};
  S.permsBaseline = {};
  S.permsDraft = {};
  S.dirtyPerms = {};
  S.meta = { channels: [], roles: [] };
  S.modulesCache = {};
  S.schema = [];
  S.controller = [];
  S.trends = [];
  S.listsCache = { autoresponder: [], customCommands: [], levelRewards: [], shop: [], rrOptions: [] };
  try { dirty.clear(); } catch (_) {}
  try { S.editingCmd = null; } catch (_) {}
  try { writeHashGid(gid); } catch (_) {}
  try { if (typeof Dash.markSelectedGuild === 'function') Dash.markSelectedGuild(gid); } catch (_) {}
  try { showViews(true); } catch (_) {}
  try { setBusy(); } catch (_) {}
  try { setStatus('Caricamento server…'); } catch (_) {}
  try { renderCtx({ name: fallbackName || 'Server' }, fallbackName || 'Server', 'Caricamento…'); } catch (_) {}
  try {
    var results = await Promise.all([
      getJSON("/api/guilds/" + encodeURIComponent(gid)),
      getJSON("/api/guilds/" + encodeURIComponent(gid) + "/schema"),
      getJSON("/api/guilds/" + encodeURIComponent(gid) + "/meta")
    ]);
    var detail = results[0];
    var schema = results[1];
    var meta = results[2];
    S.entry = detail;
    S.meta = meta || { channels: [], roles: [] };
    if (!S.meta.channels) S.meta.channels = [];
    if (!S.meta.roles) S.meta.roles = [];
    S.schema = Array.isArray(schema) ? schema : [];
    S.modulesCache = (detail && detail.modules) || {};
    try { S.baseline = JSON.parse(JSON.stringify(S.modulesCache)); } catch (_) { S.baseline = {}; }
    S.controller = (detail && Array.isArray(detail.controller)) ? detail.controller : [];
    S.listsCache = normalizeLists(detail && detail.lists);
    var perms = (detail && detail.perms) || {};
    S.permsBaseline = {};
    S.permsDraft = {};
    try {
      Object.keys(perms).forEach(function (k) {
        var v = Array.isArray(perms[k]) ? perms[k].slice() : [];
        S.permsBaseline[k] = v.slice();
        S.permsDraft[k] = v.slice();
      });
    } catch (_) {}
    S.trends = normalizeTrends(detail && detail.stats && detail.stats.trends);
    try {
      if (typeof Dash.renderCtxDetail === 'function') Dash.renderCtxDetail(detail);
      else {
        var g = (detail && detail.guild) || { name: fallbackName || 'Server' };
        var sub = '';
        try {
          var mc = detail && detail.counts && detail.counts.members;
          sub = mc !== null && mc !== undefined ? (mc + ' membri') : '';
        } catch (_) {}
        renderCtx(g, g.name, sub);
      }
    } catch (_) {}
    try { if (typeof Dash.renderPanoramica === 'function') Dash.renderPanoramica(detail); } catch (_) {}
    try { if (typeof Dash.renderModuleList === 'function') Dash.renderModuleList(); } catch (_) {}
    try { if (typeof Dash.openEntry === 'function') Dash.openEntry('panoramica'); } catch (_) {}
    try { if (typeof Dash.renderLists === 'function') Dash.renderLists(Dash.state.listsCache); } catch (_) {}
    try { if (typeof Dash.renderMatrix === 'function') Dash.renderMatrix(detail && detail.perms); } catch (_) {}
    try { if (typeof Dash.buildRoleSelects === 'function') Dash.buildRoleSelects(); } catch (_) {}
    try { clearBusy(); } catch (_) {}
    try { setStatus(''); } catch (_) {}
    try { refreshStatus(); } catch (_) {}
    return detail;
  } catch (e) {
    try { clearBusy(); } catch (_) {}
    try { setStatus('Impossibile caricare il server.'); } catch (_) {}
    try { toast('Impossibile caricare il server. Riprova.', 'err'); } catch (_) {}
    throw e;
  }
}

function boot() {
  try { initConfirm(); } catch (_) {}
  try { initNav(); } catch (_) {}
  try { initShortcut(); } catch (_) {}
  try { initDirtyBar(); } catch (_) {}
  try { showViews(false); } catch (_) {}
  try { if (typeof Dash.showGuildSkeletons === 'function') Dash.showGuildSkeletons(); } catch (_) {}
  try {
    window.addEventListener('hashchange', function () {
      try {
        var h = readHashGid();
        if (h && h !== S.gid) selectGuild(h);
      } catch (_) {}
    });
  } catch (_) {}
  try {
    loadMe().then(function () {
      try { if (typeof Dash.loadGuilds === 'function') return Dash.loadGuilds(); } catch (_) {}
      return null;
    }).catch(function () {});
  } catch (_) {}
}

Dash.$ = $;
Dash.clear = clear;
Dash.toast = toast;
Dash.goLogin = goLogin;
Dash.needLogin = needLogin;
Dash.checkAuth = checkAuth;
Dash.errorBody = errorBody;
Dash.failWith = failWith;
Dash.getJSON = getJSON;
Dash.putJSON = putJSON;
Dash.putModule = putModule;
Dash.initials = initials;
Dash.fmtNum = fmtNum;
Dash.fmtCompact = fmtCompact;
Dash.animateValue = animateValue;
Dash.prefersReduced = prefersReduced;
Dash.skeletonLine = skeletonLine;
Dash.setSaving = setSaving;
Dash.openConfirm = openConfirm;
Dash.initConfirm = initConfirm;
Dash.openNav = openNav;
Dash.closeNav = closeNav;
Dash.initNav = initNav;
Dash.readHashGid = readHashGid;
Dash.writeHashGid = writeHashGid;
Dash.initShortcut = initShortcut;
Dash.setStatus = setStatus;
Dash.showViews = showViews;
Dash.renderCtx = renderCtx;
Dash.setAvatar = setAvatar;
Dash.loadMe = loadMe;
Dash.refreshStatus = refreshStatus;
Dash.NUMBER_RANGES = NUMBER_RANGES;
Dash.TEXT_LIMITS = TEXT_LIMITS;
Dash.NONE_VALUE = NONE_VALUE;
Dash.PERM_COMMANDS = PERM_COMMANDS;
Dash.MODULE_ICONS = MODULE_ICONS;
Dash.roleName = roleName;
Dash.normalizeLists = normalizeLists;
Dash.normalizeTrends = normalizeTrends;
Dash.emptyBox = emptyBox;
Dash.deleteBtn = deleteBtn;
Dash.attachCounter = attachCounter;
Dash.elNS = elNS;
Dash.shortDay = shortDay;
Dash.chartPath = chartPath;
Dash.sumKey = sumKey;
Dash.deltaLabel = deltaLabel;
Dash.fillRoleSelect = fillRoleSelect;
Dash.insertVar = insertVar;
Dash.dirty = dirty;
Dash.updateDirtyBar = updateDirtyBar;
Dash.saveAllDirty = saveAllDirty;
Dash.discardAllDirty = discardAllDirty;
Dash.initDirtyBar = initDirtyBar;
Dash.selectGuild = selectGuild;
Dash.clearBusy = clearBusy;

try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
} catch (_) {}

})();
