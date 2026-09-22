/* panoramica.js — vista "Panoramica" del pannello (stile PeakBot/YouTube-Studio).
 * Usa SOLO window.Dash di core.js + DOM. Nessuna chiamata API tranne
 * la GET audit opzionale per guild (endpoint nuovo: 404 -> card nascosta).
 */
(function () {
  'use strict';

  var Dash = window.Dash || (window.Dash = {});
  var state = Dash.state || (Dash.state = {});

  function $(sel, root) {
    if (typeof Dash.$ === 'function') return Dash.$(sel, root);
    return (root || document).querySelector(sel);
  }

  function clear(el) {
    if (!el) return;
    if (typeof Dash.clear === 'function') { Dash.clear(el); return; }
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function fmtNum(n) {
    if (typeof Dash.fmtNum === 'function') {
      try { return Dash.fmtNum(n); } catch (e) { /* fallback sotto */ }
    }
    return Number(n || 0).toLocaleString('it-IT');
  }

  function fmtCompact(n) {
    if (typeof Dash.fmtCompact === 'function') {
      try { return Dash.fmtCompact(n); } catch (e) { /* fallback sotto */ }
    }
    var v = Number(n || 0);
    if (Math.abs(v) >= 1000) return (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k';
    return String(v);
  }

  function sumKey(rows, key) {
    if (typeof Dash.sumKey === 'function') {
      try { return Dash.sumKey(rows, key) || 0; } catch (e) { /* fallback sotto */ }
    }
    var t = 0;
    (rows || []).forEach(function (r) {
      var v = Number(r && r[key]);
      if (Number.isFinite(v)) t += v;
    });
    return t;
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function pick(obj, keys, fb) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj && obj[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return fb;
  }

  function setText(el, txt) {
    if (el) el.textContent = txt;
  }

  function mk(tag, cls, txt) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (txt !== undefined && txt !== null) el.textContent = txt;
    return el;
  }

  function elNS(tag, attrs) {
    if (typeof Dash.elNS === 'function') {
      try {
        var out = Dash.elNS(tag, attrs);
        if (out) return out;
      } catch (e) { /* fallback sotto */ }
    }
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    }
    return el;
  }

  /* Card statistica locale (NON usare Dash.statCard: ridefinita qui). */
  function statCard(icon, label, value, sub) {
    var card = mk('div', 'card stat-card');
    var head = mk('div', 'stat-head');
    var ico = null;
    if (typeof Dash.iconEl === 'function') {
      try { ico = Dash.iconEl(icon); } catch (e) { ico = null; }
    }
    if (ico && typeof ico.nodeType === 'number') {
      head.appendChild(ico);
    } else if (typeof ico === 'string' && ico) {
      var s = mk('span', 'stat-ico', ico);
      head.appendChild(s);
    }
    var lab = mk('span', 'stat-label', label);
    head.appendChild(lab);
    card.appendChild(head);
    var val = mk('strong', 'stat-value', value);
    card.appendChild(val);
    if (typeof Dash.animateValue === 'function' && /^-?[\d.,\s]+$/.test(String(value))) {
      try { Dash.animateValue(val, num(String(value).replace(/[^\d-]/g, '')) || 0); } catch (e) { /* resta il testo */ }
    }
    if (sub) card.appendChild(mk('small', 'stat-sub muted', sub));
    return card;
  }

  function shortDay(d) {
    if (typeof Dash.shortDay === 'function') {
      try { return Dash.shortDay(d); } catch (e) { /* fallback sotto */ }
    }
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d || '');
    return dt.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  }

  function pathFor(points) {
    var d = null;
    if (typeof Dash.chartPath === 'function') {
      try { d = Dash.chartPath(points); } catch (e) { d = null; }
    }
    if (typeof d !== 'string' || d.charAt(0) !== 'M') {
      d = points.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
      }).join(' ');
    }
    return d;
  }

  var lockdownToastShown = false;
  function checkLockdown() {
    var active = false;
    try { active = !!(state.modulesCache && state.modulesCache.lockdown && state.modulesCache.lockdown.active); } catch (e) { active = false; }
    if (active && !lockdownToastShown && typeof Dash.toast === 'function') {
      lockdownToastShown = true;
      try { Dash.toast('Lockdown attivo: nuovi ingressi limitati.', 'err'); } catch (e) { /* ignora */ }
    }
    return active;
  }

  function getTrends(detail) {
    var t = state.trends;
    if (!Array.isArray(t) || !t.length) t = detail && detail.stats && detail.stats.trends;
    if (!Array.isArray(t)) return [];
    return t.slice(-30);
  }

  function getChartDays() {
    try {
      if (state.chartDays === 7 || state.chartDays === 30) return state.chartDays;
    } catch (e) { /* default sotto */ }
    return 30;
  }

  function setChartDays(n) {
    try {
      state.chartDays = (n === 7) ? 7 : 30;
    } catch (e) { /* ignora */ }
  }

  var lastDetailRef = null;

  function relTime(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    try {
      var diffSec = Math.round((d.getTime() - Date.now()) / 1000);
      var abs = Math.abs(diffSec);
      var val = diffSec, unit = 'second';
      if (abs < 60) { val = diffSec; unit = 'second'; }
      else if (abs < 3600) { val = Math.round(diffSec / 60); unit = 'minute'; }
      else if (abs < 86400) { val = Math.round(diffSec / 3600); unit = 'hour'; }
      else if (abs < 604800) { val = Math.round(diffSec / 86400); unit = 'day'; }
      else if (abs < 2592000) { val = Math.round(diffSec / 604800); unit = 'week'; }
      else if (abs < 31536000) { val = Math.round(diffSec / 2592000); unit = 'month'; }
      else { val = Math.round(diffSec / 31536000); unit = 'year'; }
      var rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
      return rtf.format(val, unit);
    } catch (e) { /* fallback sotto */ }
    try { return d.toLocaleString('it-IT'); } catch (e2) { return null; }
  }

  function absDate(ts) {
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString('it-IT');
    } catch (e) { return null; }
  }

  /* Switch 7/30 giorni creato dinamicamente in .chart-head. Nessun endpoint nuovo. */
  function ensurePeriodSwitch(onChange) {
    var head = null;
    try { head = $('.chart-head'); } catch (e) { head = null; }
    if (!head) return null;
    try {
      var old = null;
      try { old = head.querySelector('[data-chart-days]'); } catch (e) { old = null; }
      var wrap = null;
      try { wrap = head.querySelector('.chart-period'); } catch (e) { wrap = null; }
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'chart-period';
        head.appendChild(wrap);
      } else {
        clear(wrap);
      }
      var days = getChartDays();
      [7, 30].forEach(function (n) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm' + (n === days ? ' is-active' : '');
        b.setAttribute('data-chart-days', String(n));
        b.setAttribute('aria-pressed', n === days ? 'true' : 'false');
        b.textContent = n === 7 ? '7 giorni' : '30 giorni';
        b.addEventListener('click', function () {
          setChartDays(n);
          try {
            var btns = wrap.querySelectorAll('[data-chart-days]');
            Array.prototype.forEach.call(btns, function (x) {
              var on = x.getAttribute('data-chart-days') === String(getChartDays());
              x.classList.toggle('is-active', on);
              x.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          } catch (e) { /* ignora */ }
          if (typeof onChange === 'function') {
            try { onChange(getChartDays()); } catch (e) { /* ignora */ }
          }
        });
        wrap.appendChild(b);
      });
      return wrap;
    } catch (e) { return null; }
  }

  function refreshChartForPeriod() {
    try {
      var all = getTrends(lastDetailRef);
      var days = getChartDays();
      var sliced = all.slice(-days);
      var totals = {
        messages: sumKey(sliced, 'messages'),
        joins: sumKey(sliced, 'joins'),
        leaves: sumKey(sliced, 'leaves')
      };
      return renderChart(sliced, totals, days);
    } catch (e) { return null; }
  }

  /* Grafico SVG 7/30 giorni: area messaggi + linee ingressi/uscite. */
  function renderChart(trends, totals, optDays) {
    var wrap = $('#chart-wrap');
    var summary = $('#chart-summary');
    var checks = { chart: false, tip: false, summary: false, empty: false };
    if (!wrap) return checks;

    var tip = $('#chart-tip');
    if (!tip) {
      tip = mk('div', 'chart-tip');
      tip.id = 'chart-tip';
      try { tip.hidden = true; } catch (e) { tip.setAttribute('hidden', ''); }
      wrap.appendChild(tip);
    }
    checks.tip = true;

    /* Svuota il wrap ma conserva il tooltip. */
    Array.prototype.slice.call(wrap.childNodes).forEach(function (n) {
      if (n !== tip) wrap.removeChild(n);
    });

    function hideTip() {
      try { tip.hidden = true; } catch (e) { tip.setAttribute('hidden', ''); }
    }

    var rows = (trends || []).map(function (r) {
      return { date: r.date, messages: num(r.messages), joins: num(r.joins), leaves: num(r.leaves) };
    });
    var hasData = rows.length > 0 && rows.some(function (r) { return r.messages > 0 || r.joins > 0 || r.leaves > 0; });

    var days = (optDays === 7 || optDays === 30) ? optDays : getChartDays();
    var t = totals || { messages: 0, joins: 0, leaves: 0 };
    var summaryTxt = fmtNum(t.messages) + ' messaggi · ' + fmtNum(t.joins) +
      ' ingressi · ' + fmtNum(t.leaves) + ' uscite negli ultimi ' + days + ' giorni.';
    if (summary) { setText(summary, summaryTxt); checks.summary = true; }

    if (!hasData) {
      var emptyEl = null;
      if (typeof Dash.emptyBox === 'function') {
        try { emptyEl = Dash.emptyBox('chart', 'Ancora nessun dato', 'I conteggi partono da oggi.', null); } catch (e) { emptyEl = null; }
      }
      if (!emptyEl || !emptyEl.nodeType) emptyEl = mk('p', 'muted', 'Ancora nessun dato');
      wrap.appendChild(emptyEl);
      hideTip();
      checks.empty = true;
      return checks;
    }

    var W = 640, H = 240, PL = 46, PR = 14, PT = 14, PB = 30;
    var n = rows.length;
    var max = 1;
    rows.forEach(function (r) { max = Math.max(max, r.messages, r.joins, r.leaves); });
    var iw = W - PL - PR, ih = H - PT - PB;
    function X(i) { return PL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1)); }
    function Y(v) { return PT + (1 - (num(v) / max)) * ih; }

    var svg = elNS('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      class: 'chart-svg',
      role: 'img',
      'aria-label': 'Andamento di messaggi, ingressi e uscite negli ultimi ' + days + ' giorni.'
    });
    try { svg.tabIndex = 0; } catch (e) { svg.setAttribute('tabindex', '0'); }

    var gridSteps = 4, g;
    for (g = 0; g <= gridSteps; g++) {
      var gv = Math.round((max * g) / gridSteps);
      var gy = Y(gv);
      svg.appendChild(elNS('line', { x1: PL, y1: gy, x2: W - PR, y2: gy, class: 'grid' }));
      var gl = elNS('text', { x: PL - 6, y: gy + 4, class: 'axis', 'text-anchor': 'end' });
      setText(gl, fmtCompact(gv));
      svg.appendChild(gl);
    }

    var tickEvery = Math.max(1, Math.ceil(n / 6)), i;
    for (i = 0; i < n; i += tickEvery) {
      var xt = elNS('text', { x: X(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' });
      setText(xt, shortDay(rows[i].date));
      svg.appendChild(xt);
    }

    var msgPts = rows.map(function (r, idx) { return { x: X(idx), y: Y(r.messages) }; });
    var joinPts = rows.map(function (r, idx) { return { x: X(idx), y: Y(r.joins) }; });
    var leavePts = rows.map(function (r, idx) { return { x: X(idx), y: Y(r.leaves) }; });

    var areaD = pathFor(msgPts) + ' L' + X(n - 1).toFixed(1) + ' ' + (PT + ih).toFixed(1) +
      ' L' + X(0).toFixed(1) + ' ' + (PT + ih).toFixed(1) + ' Z';
    svg.appendChild(elNS('path', { d: areaD, class: 'area-msg' }));
    svg.appendChild(elNS('path', { d: pathFor(joinPts), class: 'ln-join', fill: 'none' }));
    svg.appendChild(elNS('path', { d: pathFor(leavePts), class: 'ln-leave', fill: 'none' }));

    msgPts.forEach(function (p) {
      svg.appendChild(elNS('circle', { cx: p.x, cy: p.y, r: 2.4, class: 'dot-msg' }));
    });

    var focusIdx = -1;
    function showTip(idx, anchor) {
      var r = rows[idx];
      if (!r) return;
      focusIdx = idx;
      setText(tip, shortDay(r.date) + ': ' + fmtNum(r.messages) + ' messaggi · ' +
        fmtNum(r.joins) + ' ingressi · ' + fmtNum(r.leaves) + ' uscite');
      try { tip.hidden = false; } catch (e) { tip.removeAttribute('hidden'); }
      if (anchor) {
        var box = wrap.getBoundingClientRect();
        var px = anchor.clientX - box.left, py = anchor.clientY - box.top;
        tip.style.left = Math.max(0, Math.min(box.width - 8, px + 12)) + 'px';
        tip.style.top = Math.max(0, py - 12) + 'px';
      } else {
        tip.style.left = '12px';
        tip.style.top = '8px';
      }
    }

    for (i = 0; i < n; i++) {
      (function (idx) {
        var w = n > 1 ? iw / (n - 1) : iw;
        var zone = elNS('rect', {
          x: Math.max(0, X(idx) - w / 2), y: PT, width: Math.max(2, w), height: ih, class: 'hit', fill: 'transparent'
        });
        zone.addEventListener('mousemove', function (ev) { showTip(idx, ev); });
        zone.addEventListener('mouseenter', function (ev) { showTip(idx, ev); });
        zone.addEventListener('click', function (ev) { showTip(idx, ev); });
        zone.addEventListener('mouseleave', hideTip);
        svg.appendChild(zone);
      })(i);
    }

    svg.addEventListener('mouseleave', hideTip);
    svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        var next = focusIdx < 0 ? (ev.key === 'ArrowRight' ? 0 : n - 1)
          : Math.min(n - 1, Math.max(0, focusIdx + (ev.key === 'ArrowRight' ? 1 : -1)));
        showTip(next, null);
      } else if (ev.key === 'Escape') {
        hideTip();
        try { svg.blur(); } catch (e) { /* ignora */ }
      }
    });

    wrap.appendChild(svg);
    checks.chart = true;
    return checks;
  }

  function renderStats(detail, trends, totals) {
    var box = $('#stats');
    if (!box) return { cards: 0 };
    clear(box);

    var counts = (detail && detail.counts) || {};
    var members = pick(counts, ['members'], detail && detail.guild && detail.guild.memberCount);
    var channels = pick(counts, ['channels'], 0);
    var roles = pick(counts, ['roles'], 0);
    box.appendChild(statCard('users', 'Membri', fmtNum(members),
      fmtNum(channels) + ' canali · ' + fmtNum(roles) + ' ruoli'));

    var analytics = detail && detail.stats && detail.stats.analytics;
    var msgVal = totals.messages, msgSub;
    if (totals.messages > 0) {
      msgSub = 'ultimi 30 giorni';
      if (typeof Dash.deltaLabel === 'function' && trends.length >= 14) {
        try {
          var cur = 0, prev = 0, k;
          for (k = trends.length - 7; k < trends.length; k++) cur += num(trends[k].messages);
          for (k = trends.length - 14; k < trends.length - 7; k++) prev += num(trends[k].messages);
          var dl = Dash.deltaLabel(cur, prev);
          if (typeof dl === 'string' && dl) msgSub += ' (' + dl + ')';
        } catch (e) { /* solo testo base */ }
      }
    } else if (analytics && num(analytics.messages) > 0) {
      msgVal = num(analytics.messages);
      msgSub = 'ultimi 7 giorni';
    } else {
      msgSub = 'ultimi 30 giorni';
    }
    box.appendChild(statCard('chat', 'Messaggi', fmtNum(msgVal), msgSub));

    box.appendChild(statCard('door', 'Ingressi / Uscite',
      fmtNum(totals.joins) + ' / ' + fmtNum(totals.leaves), 'ultimi 30 giorni'));

    var openT = 0;
    try {
      openT = detail && detail.stats
        ? pick(detail.stats, ['openTickets'], detail.stats.tickets && detail.stats.tickets.open)
        : 0;
    } catch (e) { openT = 0; }
    box.appendChild(statCard('ticket', 'Ticket aperti', fmtNum(openT), 'da gestire'));

    var lists = (detail && detail.lists) || {};
    var triggers = Array.isArray(lists.autoresponder) ? lists.autoresponder.length : 0;
    var commands = Array.isArray(lists.customCommands) ? lists.customCommands.length : 0;
    var rewards = Array.isArray(lists.levelRewards) ? lists.levelRewards.length : 0;
    box.appendChild(statCard('zap', 'Automazioni', fmtNum(triggers + commands),
      fmtNum(triggers) + ' trigger · ' + fmtNum(commands) + ' comandi · ' + fmtNum(rewards) + ' ricompense'));

    return { cards: box.childNodes.length };
  }

  function renderTops(detail) {
    var out = { levels: 0, eco: 0 };
    var lvBox = $('#top-levels'), ecoBox = $('#top-eco');

    function fill(box, rows, textOf) {
      if (!box) return 0;
      clear(box);
      var list = (rows || []).slice(0, 5);
      if (!list.length) {
        box.appendChild(mk('li', 'muted', 'Nessun dato per ora.'));
        return 0;
      }
      list.forEach(function (r, idx) {
        box.appendChild(mk('li', null, (idx + 1) + '. ' + textOf(r)));
      });
      return list.length;
    }

    if (lvBox) {
      var lv = detail && detail.stats && detail.stats.levels;
      out.levels = fill(lvBox, lv, function (r) {
        var name = pick(r, ['username', 'user', 'name', 'tag'], r && r.id);
        return name + ' — livello ' + fmtNum(r.level) + ' · ' + fmtNum(r.xp) + ' XP';
      });
    }
    if (ecoBox) {
      var eco = detail && detail.stats && detail.stats.economy;
      out.eco = fill(ecoBox, eco, function (r) {
        var name = pick(r, ['username', 'user', 'name', 'tag'], r && r.id);
        return name + ' — ' + fmtNum(pick(r, ['balance', 'coins', 'monete'], 0)) + ' monete';
      });
    }
    return out;
  }

  /* Card "Attività recente": creata qui, nessun markup in app.html. */
  function ensureAuditCard() {
    var sec = $('#sec-panoramica');
    if (!sec) return null;
    var card = $('#audit-card');
    var list;
    if (!card) {
      card = mk('div', 'card');
      card.id = 'audit-card';
      card.appendChild(mk('h3', null, 'Attività recente'));
      list = mk('ul', 'itemlist');
      list.id = 'audit-list';
      card.appendChild(list);
      sec.appendChild(card);
    } else {
      list = $('#audit-list');
      if (!list) {
        list = mk('ul', 'itemlist');
        list.id = 'audit-list';
        card.appendChild(list);
      }
    }
    return { card: card, list: list };
  }

  function loadAudit(detail) {
    var slots = ensureAuditCard();
    var res = { state: 'skipped' };
    if (!slots) return res;
    var gid = (detail && detail.guild && detail.guild.id) ||
      state.gid || state.guildId || state.selectedGuild || state.currentGuild;
    if (!gid || typeof Dash.getJSON !== 'function') {
      slots.card.style.display = 'none';
      res.state = 'hidden';
      return res;
    }
    /* Endpoint nuovo: se manca (404) la card resta nascosta. */
    var url = '/api/guilds/' + encodeURIComponent(gid) + '/audit';
    Dash.getJSON(url).then(function (data) {
      var entries = [];
      if (Array.isArray(data)) entries = data;
      else if (data && Array.isArray(data.entries)) entries = data.entries;
      else if (data && Array.isArray(data.audit)) entries = data.audit;
      clear(slots.list);
      if (!entries.length) {
        slots.list.appendChild(mk('li', 'muted', 'Nessun evento registrato.'));
        res.state = 'empty';
        return;
      }
      entries.slice(0, 8).forEach(function (e) {
        var actor = pick(e, ['actor', 'autore', 'user', 'utente', 'username'], '—');
        var mod = pick(e, ['module', 'modulo', 'section'], '—');
        var ts = pick(e, ['ts', 'at', 'date', 'createdAt', 'time'], null);
        var when = '—';
        if (ts) {
          var rel = relTime(ts);
          if (rel) when = rel;
          else {
            var abs = absDate(ts);
            if (abs) when = abs;
          }
        }
        var summary = pick(e, ['summary', 'descrizione', 'text', 'azione'], '');
        var line = actor + ' · ' + mod + ' · ' + when;
        if (summary) line += ' — ' + summary;
        slots.list.appendChild(mk('li', null, line));
      });
      res.state = 'ok';
    }).catch(function () {
      slots.card.style.display = 'none';
      res.state = 'hidden';
    });
    return res;
  }

  function renderPanoramica(detail) {
    checkLockdown();
    try { lastDetailRef = detail || null; } catch (e) { /* ignora */ }
    var allTrends = getTrends(detail);
    var days = getChartDays();
    var chartTrends = allTrends.slice(-days);
    var chartTotals = {
      messages: sumKey(chartTrends, 'messages'),
      joins: sumKey(chartTrends, 'joins'),
      leaves: sumKey(chartTrends, 'leaves')
    };
    var totals = {
      messages: sumKey(allTrends, 'messages'),
      joins: sumKey(allTrends, 'joins'),
      leaves: sumKey(allTrends, 'leaves')
    };
    try {
      ensurePeriodSwitch(function () { refreshChartForPeriod(); });
    } catch (e) { /* switch non critico */ }
    var chart = renderChart(chartTrends, chartTotals, days);
    var stats = renderStats(detail, allTrends, totals);
    var tops = renderTops(detail);
    var audit = loadAudit(detail);
    return {
      ok: true,
      totals: totals,
      chart: chart,
      stats: stats,
      tops: tops,
      audit: audit,
      checks: {
        hasChart: !!chart.chart || !!chart.empty,
        hasTip: !!chart.tip,
        hasSummary: !!chart.summary,
        statCards: stats.cards,
        topLevels: tops.levels,
        topEco: tops.eco
      }
    };
  }

  Dash.renderPanoramica = renderPanoramica;

})();
