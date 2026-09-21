/* Pannello bot — Vanilla JS, niente framework.
   Contratto API (unico consentito):
   GET me, GET guilds, GET dettaglio, GET schema, GET meta,
   PUT modules/:mod, PUT perms.
   Salvataggi normali senza modale: barra "modifiche non salvate".
   Modale solo per azioni distruttive. XSS-safe: solo
   createElement/textContent; gli unici innerHTML sono stringhe SVG statiche. */
(function () {
  "use strict";

  var PERM_COMMANDS = [
    "ban", "kick", "timeout", "warn", "clear", "slowmode",
    "lock", "nuke", "giveaway", "poll", "ticket",
    "setup", "embed", "evento", "template"
  ];

  var TABS = [
    { id: "panoramica", label: "Panoramica", icon: "chart" },
    { id: "moduli", label: "Moduli", icon: "grid" },
    { id: "liste", label: "Liste", icon: "list" },
    { id: "permessi", label: "Permessi", icon: "lock" }
  ];

  var MODULE_ICONS = {
    general: "sliders", welcome: "flag", automod: "shield",
    autorole: "users", levels: "star", rewards: "award",
    tickets: "ticket", ticketsPlus: "ticket", tempvoice: "mic",
    ai: "cpu", aiPlus: "cpu", starboard: "star",
    confessioni: "eye", autoresponder: "message", commands: "terminal",
    reactionRoles: "check", lockdown: "lock", shop: "cart"
  };

  var ICONS = {
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4"/><path d="M6 4h11l-3 4 3 4H6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.6.7 4.5 2.8 4.5 5.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.8-5.4 2.8 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    award: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M9 13.5L7 21l5-2.8L17 21l-2-7.5"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16v2.5a2.5 2.5 0 0 0 0 5V18H4v-2.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 8v2M14 12v1M14 15v3" stroke-dasharray="1 2"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>',
    cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="18" r="1.2" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>',
    server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r="1" fill="currentColor"/><circle cx="7" cy="16.5" r="1" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11h10.2L21 8H7"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="16.5" cy="20" r="1.4"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
  };

  var state = {
    gid: null,
    guilds: [],
    filter: "all",
    search: "",
    meta: { channels: [], roles: [] },
    modulesCache: {},
    listsCache: { autoresponder: [], customCommands: [], levelRewards: [], shop: [] },
    schema: [],
    activeTab: "panoramica",
    activeModule: null,
    moduleSection: "all",
    modSearch: "",
    baseline: {},
    pending: {},
    dirtyModules: {},
    permsBaseline: {},
    permsDraft: {},
    dirtyPerms: {},
    trends: [],
    apiMs: null
  };

  var NUMBER_RANGES = { maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90], maxCapsPercent: [10, 100], threshold: [1, 100], delaySeconds: [0, 3600] };
  var TEXT_LIMITS = { welcomeMessage: 500, goodbyeMessage: 500, systemPrompt: 1000, badWords: 1000, title: 100, description: 500 };
  var DEFAULT_TEXT_MAX = 1000;
  var NONE_VALUE = "__none__";
  var SKELETON_COUNT = 4;
  var MAX_TOASTS = 4;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg) {
    $("status").textContent = msg || "";
  }

  function prefersReduced() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { return false; }
  }

  function goLogin() {
    window.location.href = "/login";
  }

  function needLogin(d) {
    if (d && (d.relogin === true || d.relogin === "true" || d.relogin === 1)) {
      goLogin();
      return true;
    }
    return false;
  }

  function iconEl(name) {
    var s = document.createElement("span");
    s.className = "svg-ico";
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name] || ICONS.info;
    return s;
  }

  function toast(msg, kind) {
    var wrap = $("toasts");
    while (wrap.childNodes.length >= MAX_TOASTS) {
      wrap.removeChild(wrap.firstChild);
    }
    var el = document.createElement("div");
    el.className = "toast" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    el.setAttribute("role", kind === "err" ? "alert" : "status");
    var txt = document.createElement("div");
    txt.textContent = msg;
    el.appendChild(txt);
    var bar = document.createElement("div");
    bar.className = "toast-bar";
    bar.setAttribute("aria-hidden", "true");
    bar.appendChild(document.createElement("span"));
    el.appendChild(bar);
    var kill = function () {
      if (!el.parentNode) return;
      if (prefersReduced()) {
        el.parentNode.removeChild(el);
        return;
      }
      el.classList.add("out");
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    };
    el.addEventListener("click", kill);
    wrap.appendChild(el);
    window.setTimeout(kill, 4500);
  }

  function checkAuth(res) {
    if (res.status === 401) {
      goLogin();
      throw new Error("unauthorized");
    }
    return res;
  }

  function errorBody(res, fallback) {
    return res.text().then(function (t) {
      try {
        var j = JSON.parse(t);
        if (j && typeof j === "object") {
          if (j.relogin) { goLogin(); throw new Error("unauthorized"); }
          var m = j.errore || j.error || j.message;
          if (m) return String(m) + " (HTTP " + res.status + ")";
        }
      } catch (e) {
        if (e && e.message === "unauthorized") throw e;
      }
      if (t) return fallback + " (HTTP " + res.status + ")";
      return fallback + " (HTTP " + res.status + ")";
    });
  }

  function failWith(res, fallback) {
    return errorBody(res, fallback).then(function (msg) {
      throw new Error(msg);
    });
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(checkAuth)
      .then(function (res) {
        if (!res.ok) return failWith(res, "Lettura dati fallita");
        return res.json().then(function (d) {
          if (needLogin(d)) throw new Error("unauthorized");
          return d;
        });
      });
  }

  function putJSON(url, body) {
    return fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    })
      .then(checkAuth)
      .then(function (res) {
        if (!res.ok) return failWith(res, "Salvataggio rifiutato");
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (needLogin(d)) throw new Error("unauthorized");
          return d;
        });
      });
  }

  function putModule(modName, body) {
    return putJSON("/api/guilds/" + encodeURIComponent(state.gid) + "/modules/" + encodeURIComponent(modName), body);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function initials(name) {
    if (!name) return "?";
    var parts = String(name).trim().split(/\s+/);
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[1].charAt(0) : "")).toUpperCase();
  }

  function fmtNum(n) {
    if (n === null || n === undefined) return "—";
    try { return Number(n).toLocaleString("it-IT"); } catch (e) { return String(n); }
  }

  function fmtCompact(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    if (n >= 1000) return (Math.round(n / 100) / 10).toLocaleString("it-IT") + "k";
    return String(n);
  }

  function animateValue(el, target) {
    var num = Number(target);
    if (!isFinite(num) || prefersReduced()) {
      el.textContent = fmtNum(target);
      return;
    }
    var t0 = null;
    var dur = 750;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(Math.round(num * eased));
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  /* ---------- Skeleton ---------- */
  function skeletonLine(width) {
    var s = document.createElement("span");
    s.className = "skeleton";
    s.style.width = width || "100%";
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  function showGuildSkeletons() {
    var list = $("guild-list");
    clear(list);
    list.setAttribute("aria-busy", "true");
    for (var i = 0; i < SKELETON_COUNT; i++) {
      var li = document.createElement("li");
      li.className = "skeleton-row";
      li.setAttribute("aria-hidden", "true");
      var av = document.createElement("span");
      av.className = "skeleton sk-avatar";
      var lines = document.createElement("span");
      lines.className = "sk-lines";
      lines.appendChild(skeletonLine("70%"));
      lines.appendChild(skeletonLine("45%"));
      li.appendChild(av);
      li.appendChild(lines);
      list.appendChild(li);
    }
  }

  function showPanelSkeletons() {
    var stats = $("stats");
    if (stats) {
      clear(stats);
      stats.setAttribute("aria-busy", "true");
      for (var i = 0; i < 3; i++) {
        var card = document.createElement("div");
        card.className = "stat-card is-loading";
        card.setAttribute("aria-hidden", "true");
        card.appendChild(skeletonLine("50%"));
        var gap = document.createElement("div");
        gap.style.height = "0.6rem";
        card.appendChild(gap);
        card.appendChild(skeletonLine("80%"));
        stats.appendChild(card);
      }
    }
    var det = $("modules");
    if (det) {
      clear(det);
      det.setAttribute("aria-busy", "true");
      var m = document.createElement("div");
      m.className = "card is-loading";
      m.setAttribute("aria-hidden", "true");
      m.appendChild(skeletonLine("40%"));
      det.appendChild(m);
    }
  }

  function clearBusy() {
    ["guild-list", "stats", "modules", "module-detail"].forEach(function (id) {
      var el = $(id);
      if (el) el.setAttribute("aria-busy", "false");
    });
  }

  /* ---------- Modale (solo azioni distruttive) ---------- */
  var confirmResolve = null;

  function openConfirm(title, message) {
    return new Promise(function (resolve) {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      $("confirm-title").textContent = title || "Confermi?";
      $("confirm-msg").textContent = message || "";
      var back = $("confirm-backdrop");
      back.hidden = false;
      $("confirm-ok").focus();
    });
  }

  function closeConfirm(value) {
    var back = $("confirm-backdrop");
    if (back.hidden && confirmResolve === null) return false;
    back.hidden = true;
    var r = confirmResolve;
    confirmResolve = null;
    if (r) r(value);
    return true;
  }

  function initConfirm() {
    $("confirm-ok").addEventListener("click", function () { closeConfirm(true); });
    $("confirm-cancel").addEventListener("click", function () { closeConfirm(false); });
    $("confirm-backdrop").addEventListener("click", function (ev) {
      if (ev.target === $("confirm-backdrop")) closeConfirm(false);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        if (closeConfirm(false)) return;
        closeNav();
      }
    });
  }

  /* ---------- Drawer mobile ---------- */
  function isMobileNav() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function openNav() {
    document.body.classList.add("nav-open");
    $("nav-toggle").setAttribute("aria-expanded", "true");
    $("nav-overlay").hidden = false;
  }

  function closeNav() {
    if (!document.body.classList.contains("nav-open")) return;
    document.body.classList.remove("nav-open");
    $("nav-toggle").setAttribute("aria-expanded", "false");
    $("nav-overlay").hidden = true;
  }

  function initNav() {
    $("nav-toggle").addEventListener("click", function () {
      if (document.body.classList.contains("nav-open")) {
        closeNav();
        $("nav-toggle").focus();
      } else {
        openNav();
        var first = document.querySelector(".guild-btn");
        if (first) first.focus();
        else $("sidebar").focus();
      }
    });
    $("nav-overlay").addEventListener("click", closeNav);
  }

  /* ---------- Deep-link via hash ---------- */
  function readHashGid() {
    try {
      var h = String(window.location.hash || "");
      var m = h.match(/gid=([A-Za-z0-9]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  function writeHashGid(gid) {
    try {
      var base = String(window.location.pathname || "") + String(window.location.search || "");
      window.history.replaceState(null, "", base + "#gid=" + encodeURIComponent(gid));
    } catch (e) { /* hash non critico */ }
  }

  /* ---------- Scorciatoia "/" ---------- */
  function initShortcut() {
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var t = ev.target;
      var tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
      var cb = $("confirm-backdrop");
      if (cb && !cb.hidden) return;
      ev.preventDefault();
      if (isMobileNav() && !document.body.classList.contains("nav-open")) openNav();
      var inModules = state.gid && state.activeTab === "moduli" && !$("guild-detail").hidden;
      var target = inModules ? $("module-search") : $("guild-search");
      if (target) target.focus();
    });
  }

  /* ---------- Profilo ---------- */
  function loadMe() {
    return getJSON("/api/me").then(function (me) {
      var name = me.username || me.tag || me.name || "Utente";
      $("user-name").textContent = name;
      $("user-sub").textContent = me.id ? "ID " + me.id : "Connesso";
      var av = $("user-avatar");
      clear(av);
      if (me.avatarUrl) {
        var img = document.createElement("img");
        img.src = me.avatarUrl;
        img.alt = "";
        av.appendChild(img);
      } else {
        av.textContent = initials(name);
      }
    }).catch(function (err) {
      if (err && err.message === "unauthorized") return;
      $("user-name").textContent = "Non connesso";
      $("user-sub").textContent = "Vai a /login";
      throw err;
    });
  }

  /* ---------- Lista server ---------- */
  function filteredGuilds() {
    var q = state.search.trim().toLowerCase();
    return state.guilds.filter(function (g) {
      if (state.filter === "bot" && !g.botPresent) return false;
      if (state.filter === "missing" && (g.botPresent || !g.canManage)) return false;
      if (q && String(g.name || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function emptyBox(iconName, title, hint, cta) {
    var box = document.createElement("div");
    box.className = "empty-state";
    box.appendChild(iconEl(iconName));
    var strong = document.createElement("strong");
    strong.textContent = title;
    box.appendChild(strong);
    if (hint) {
      var p = document.createElement("p");
      p.textContent = hint;
      box.appendChild(p);
    }
    if (cta) {
      var row = document.createElement("div");
      row.className = "empty-cta";
      cta.forEach(function (c) {
        var a = document.createElement("a");
        a.className = "btn btn-sm " + (c.primary ? "btn-primary" : "btn-secondary");
        a.href = c.href;
        a.textContent = c.label;
        row.appendChild(a);
      });
      box.appendChild(row);
    }
    return box;
  }

  function guildIconEl(g) {
    var icon = document.createElement("span");
    icon.className = "guild-icon";
    if (g.icon) {
      var img = document.createElement("img");
      img.src = g.icon;
      img.alt = "";
      img.loading = "lazy";
      icon.appendChild(img);
    } else {
      icon.textContent = initials(g.name);
    }
    return icon;
  }

  function renderGuildList() {
    var list = $("guild-list");
    clear(list);
    list.setAttribute("aria-busy", "false");
    var withBot = state.guilds.filter(function (g) { return g && g.botPresent; });
    var manageable = state.guilds.filter(function (g) { return g && g.canManage; });
    $("guild-count").textContent = withBot.length + "/" + manageable.length;
    var items = filteredGuilds();
    if (state.guilds.length === 0 || items.length === 0) {
      var li = document.createElement("li");
      li.style.listStyle = "none";
      if (state.guilds.length === 0) {
        li.appendChild(emptyBox("server", "Nessun server gestibile",
          "Aggiungi il bot al tuo server e verifica di avere il permesso Gestisci Server, poi accedi di nuovo.",
          [{ label: "Accedi di nuovo", href: "/login", primary: true }]));
      } else {
        li.appendChild(emptyBox("search", "Nessun risultato", "Prova a cambiare filtro o ricerca.", null));
      }
      list.appendChild(li);
      return;
    }
    items.forEach(function (g) {
      if (!g.botPresent && !g.canManage) return;
      var li = document.createElement("li");
      var row = document.createElement("div");
      row.className = "guild-row" + (g.id === state.gid ? " is-active" : "");
      if (g.botPresent) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "guild-btn";
        btn.setAttribute("aria-current", g.id === state.gid ? "true" : "false");
        btn.dataset.gid = g.id;
        btn.setAttribute("aria-label", "Gestisci " + (g.name || g.id));
        btn.appendChild(guildIconEl(g));
        var txt = document.createElement("span");
        txt.className = "guild-txt";
        var nm = document.createElement("span");
        nm.className = "guild-name";
        nm.textContent = g.name || g.id;
        txt.appendChild(nm);
        var sub = document.createElement("span");
        sub.className = "guild-sub";
        sub.textContent = (typeof g.memberCount === "number")
          ? fmtNum(g.memberCount) + " membri" : "Apri pannello";
        txt.appendChild(sub);
        btn.appendChild(txt);
        var pill = document.createElement("span");
        pill.className = "pill pill-live";
        pill.textContent = typeof g.memberCount === "number" ? fmtCompact(g.memberCount) : "Bot";
        btn.appendChild(pill);
        btn.addEventListener("click", function () { selectGuild(g.id, g.name); });
        row.appendChild(btn);
      } else {
        row.appendChild(guildIconEl(g));
        var txt2 = document.createElement("span");
        txt2.className = "guild-txt";
        var nm2 = document.createElement("span");
        nm2.className = "guild-name";
        nm2.textContent = g.name || g.id;
        txt2.appendChild(nm2);
        var sub2 = document.createElement("span");
        sub2.className = "guild-sub";
        sub2.textContent = "Bot non installato";
        txt2.appendChild(sub2);
        row.appendChild(txt2);
        if (g.inviteUrl) {
          var add = document.createElement("a");
          add.className = "btn btn-primary btn-sm";
          add.href = g.inviteUrl;
          add.target = "_blank";
          add.rel = "noopener";
          add.textContent = "Installa";
          add.setAttribute("aria-label", "Installa il bot su " + (g.name || g.id));
          row.appendChild(add);
        } else {
          var pill2 = document.createElement("span");
          pill2.className = "pill";
          pill2.textContent = "Non collegato";
          pill2.title = "Imposta CLIENT_ID nel server per generare il link di invito";
          row.appendChild(pill2);
        }
      }
      li.appendChild(row);
      list.appendChild(li);
    });
  }

  function loadGuilds() {
    var t0 = 0;
    try { t0 = performance.now(); } catch (e) { t0 = 0; }
    return getJSON("/api/guilds").then(function (guilds) {
      try { state.apiMs = t0 ? Math.round(performance.now() - t0) : null; } catch (e) { state.apiMs = null; }
      state.guilds = Array.isArray(guilds) ? guilds : [];
      renderGuildList();
      renderOverview();
      refreshStatusPills();
      var deep = readHashGid();
      if (deep) {
        var found = state.guilds.filter(function (g) { return g && g.id === deep && g.botPresent; })[0];
        if (found) selectGuild(found.id, found.name);
      }
    });
  }

  /* ---------- Home globale ---------- */
  function overviewStat(iconName, label, raw, sub) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var top = document.createElement("div");
    top.className = "stat-top";
    top.appendChild(iconEl(iconName));
    var kk = document.createElement("span");
    kk.className = "k";
    kk.textContent = label;
    top.appendChild(kk);
    card.appendChild(top);
    var vv = document.createElement("div");
    vv.className = "v";
    card.appendChild(vv);
    if (typeof raw === "number") {
      vv.textContent = "0";
      animateValue(vv, raw);
    } else {
      vv.textContent = String(raw);
    }
    if (sub) {
      var ss = document.createElement("div");
      ss.className = "stat-sub";
      ss.textContent = sub;
      card.appendChild(ss);
    }
    return card;
  }

  function statusCard() {
    var card = document.createElement("div");
    card.className = "stat-card";
    var top = document.createElement("div");
    top.className = "stat-top";
    top.appendChild(iconEl("server"));
    var kk = document.createElement("span");
    kk.className = "k";
    kk.textContent = "Stato bot";
    top.appendChild(kk);
    card.appendChild(top);
    var vv = document.createElement("div");
    vv.className = "v status-line-v";
    var dot = document.createElement("span");
    dot.className = "status-dot on";
    dot.setAttribute("aria-hidden", "true");
    vv.appendChild(dot);
    vv.appendChild(document.createTextNode("Online"));
    card.appendChild(vv);
    var ss = document.createElement("div");
    ss.className = "stat-sub";
    ss.textContent = (typeof state.apiMs === "number") ? "Risposta in " + state.apiMs + " ms" : "Pannello collegato";
    card.appendChild(ss);
    return card;
  }

  function sparkEl(values, max) {
    var s = document.createElement("span");
    s.className = "spark";
    s.setAttribute("aria-hidden", "true");
    (values || []).slice(-7).forEach(function (v) {
      var b = document.createElement("span");
      b.className = "spark-bar";
      var h = max > 0 ? Math.max(8, Math.round((v / max) * 100)) : 8;
      b.style.height = h + "%";
      s.appendChild(b);
    });
    return s;
  }

  function renderOverview() {
    var withBot = state.guilds.filter(function (g) { return g.botPresent; });
    var missing = state.guilds.filter(function (g) { return g.canManage && !g.botPresent; });
    var members = withBot.reduce(function (acc, g) {
      return acc + (typeof g.memberCount === "number" ? g.memberCount : 0);
    }, 0);
    function stNum(g, k) {
      return (g.stats && typeof g.stats[k] === "number") ? g.stats[k] : 0;
    }
    var msg7 = withBot.reduce(function (a, g) { return a + stNum(g, "messages7"); }, 0);
    var openT = withBot.reduce(function (a, g) { return a + stNum(g, "openTickets"); }, 0);
    var box = $("overview-stats");
    clear(box);
    box.appendChild(overviewStat("server", "Server gestiti", withBot.length, null));
    box.appendChild(overviewStat("users", "Membri totali", members, null));
    box.appendChild(overviewStat("message", "Messaggi (7g)", msg7, withBot.length + (withBot.length === 1 ? " server" : " server")));
    box.appendChild(overviewStat("ticket", "Ticket aperti", openT, null));
    box.appendChild(statusCard());
    var grid = $("overview-grid");
    clear(grid);
    if (withBot.length === 0 && missing.length === 0) {
      grid.appendChild(emptyBox("server", "Collega il primo server",
        "Installa il bot in un server dove hai il permesso Gestisci Server.",
        [{ label: "Accedi con Discord", href: "/login", primary: true }]));
      return;
    }
    if (withBot.length > 0) {
      var rank = document.createElement("div");
      rank.className = "card rank-card";
      var h = document.createElement("h3");
      h.textContent = "Server per attività";
      rank.appendChild(h);
      var hp = document.createElement("p");
      hp.className = "muted small";
      hp.textContent = "Messaggi degli ultimi 7 giorni e stato di configurazione.";
      rank.appendChild(hp);
      var ordered = withBot.slice().sort(function (a, b) { return stNum(b, "messages7") - stNum(a, "messages7"); });
      var maxMsg = 1;
      ordered.forEach(function (g) {
        var m = stNum(g, "messages7");
        if (m > maxMsg) maxMsg = m;
      });
      var list = document.createElement("div");
      list.className = "rank-list";
      ordered.slice(0, 8).forEach(function (g) {
        var row = document.createElement("div");
        row.className = "rank-row";
        row.appendChild(guildIconEl(g));
        var tx = document.createElement("div");
        tx.className = "rank-txt";
        var nm = document.createElement("strong");
        nm.textContent = g.name || g.id;
        tx.appendChild(nm);
        var meta = document.createElement("div");
        meta.className = "muted small";
        var bits = [];
        if (typeof g.memberCount === "number") bits.push(fmtNum(g.memberCount) + " membri");
        bits.push(fmtNum(stNum(g, "messages7")) + " messaggi");
        if (stNum(g, "openTickets") > 0) bits.push(stNum(g, "openTickets") + " ticket aperti");
        meta.textContent = bits.join(" · ");
        tx.appendChild(meta);
        if (g.setup && typeof g.setup.done === "number" && typeof g.setup.total === "number" && g.setup.total > 0) {
          var setupWrap = document.createElement("div");
          setupWrap.className = "setup-wrap";
          var bar = document.createElement("div");
          bar.className = "setup-bar";
          var fill = document.createElement("span");
          fill.style.width = Math.round((g.setup.done / g.setup.total) * 100) + "%";
          bar.appendChild(fill);
          setupWrap.appendChild(bar);
          var lb = document.createElement("span");
          lb.className = "setup-label";
          lb.textContent = g.setup.done === g.setup.total ? "Configurato" : "Configurazione " + g.setup.done + "/" + g.setup.total;
          setupWrap.appendChild(lb);
          tx.appendChild(setupWrap);
        }
        row.appendChild(tx);
        row.appendChild(sparkEl(g.stats && g.stats.spark, maxMsg));
        var go = document.createElement("button");
        go.type = "button";
        go.className = "btn btn-secondary btn-sm";
        go.textContent = "Gestisci";
        go.setAttribute("aria-label", "Gestisci " + (g.name || g.id));
        go.addEventListener("click", function () { selectGuild(g.id, g.name); });
        row.appendChild(go);
        list.appendChild(row);
      });
      rank.appendChild(list);
      grid.appendChild(rank);
    }
    if (missing.length > 0) {
      var miss = document.createElement("div");
      miss.className = "card";
      var mh = document.createElement("h3");
      mh.textContent = "Server senza bot";
      miss.appendChild(mh);
      var mhp = document.createElement("p");
      mhp.className = "muted small";
      mhp.textContent = "Installa il bot per sbloccare la gestione.";
      miss.appendChild(mhp);
      missing.slice(0, 5).forEach(function (g) {
        var row = document.createElement("div");
        row.className = "ov-miss";
        var nm2 = document.createElement("span");
        nm2.textContent = g.name || g.id;
        row.appendChild(nm2);
        if (g.inviteUrl) {
          var a = document.createElement("a");
          a.className = "btn btn-primary btn-sm";
          a.href = g.inviteUrl;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = "Installa";
          row.appendChild(a);
        }
        miss.appendChild(row);
      });
      grid.appendChild(miss);
    }
  }

  /* ---------- Tab ---------- */
  function buildTabs() {
    var nav = $("tabs");
    clear(nav);
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (state.activeTab === t.id ? " is-active" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", state.activeTab === t.id ? "true" : "false");
      b.dataset.tab = t.id;
      b.appendChild(iconEl(t.icon));
      b.appendChild(document.createTextNode(t.label));
      b.addEventListener("click", function () { switchTab(t.id); });
      nav.appendChild(b);
    });
  }

  function switchTab(id) {
    state.activeTab = id;
    buildTabs();
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.hidden = p.dataset.tabpanel !== id;
    });
  }

  function showDetail(show) {
    $("guild-detail").hidden = !show;
    $("overview-panel").hidden = show;
    $("subheader").hidden = !show;
    $("overview-head").hidden = show;
    try {
      if (!show) document.title = "Pannello — Multi-Server Bot";
    } catch (e) {}
  }

  /* ---------- Selezione server ---------- */
  function selectGuild(gid, fallbackName) {
    state.gid = gid;
    state.activeTab = "panoramica";
    state.activeModule = null;
    state.baseline = {};
    state.pending = {};
    state.dirtyModules = {};
    state.permsBaseline = {};
    state.permsDraft = {};
    state.dirtyPerms = {};
    state.trends = [];
    updateDirtyBar();
    writeHashGid(gid);
    renderGuildList();
    if (isMobileNav()) closeNav();
    setStatus("Caricamento…");
    showDetail(true);
    buildTabs();
    switchTab("panoramica");
    var heroIcon = $("guild-hero-icon");
    clear(heroIcon);
    heroIcon.textContent = initials(fallbackName);
    $("guild-title").textContent = fallbackName || "Server " + gid;
    $("guild-sub").textContent = "Caricamento…";
    try { document.title = (fallbackName || "Server") + " — Pannello"; } catch (e) {}
    showPanelSkeletons();

    return Promise.all([
      getJSON("/api/guilds/" + encodeURIComponent(gid)),
      getJSON("/api/guilds/" + encodeURIComponent(gid) + "/schema"),
      getJSON("/api/guilds/" + encodeURIComponent(gid) + "/meta")
    ]).then(function (parts) {
      var detail = parts[0];
      var schema = parts[1];
      state.meta = normalizeMeta(parts[2]);
      state.modulesCache = (detail && detail.modules) || {};
      state.listsCache = normalizeLists(detail && detail.lists);
      state.schema = Array.isArray(schema) ? schema : [];
      state.trends = normalizeTrends(detail && detail.stats && detail.stats.trends);
      renderHero(detail, fallbackName);
      renderDetail(detail);
      renderModuleSection();
      renderLists(state.listsCache);
      renderMatrix(detail && detail.perms);
      buildRewardRoles(state.meta.roles);
      buildShopRoles();
      clearBusy();
      setStatus("");
    }).catch(function (err) {
      if (err && err.message === "unauthorized") return;
      clearBusy();
      setStatus("Errore di caricamento: " + err.message);
      toast("Errore di caricamento: " + err.message, "err");
    });
  }

  function normalizeMeta(meta) {
    var out = { channels: [], roles: [] };
    if (meta && Array.isArray(meta.channels)) out.channels = meta.channels;
    if (meta && Array.isArray(meta.roles)) out.roles = meta.roles;
    return out;
  }

  function normalizeLists(lists) {
    return {
      autoresponder: (lists && Array.isArray(lists.autoresponder)) ? lists.autoresponder : [],
      customCommands: (lists && Array.isArray(lists.customCommands)) ? lists.customCommands : [],
      levelRewards: (lists && Array.isArray(lists.levelRewards)) ? lists.levelRewards : [],
      shop: (lists && Array.isArray(lists.shop)) ? lists.shop : []
    };
  }

  function normalizeTrends(t) {
    if (!Array.isArray(t)) return [];
    return t.filter(function (d) {
      return d && typeof d.date === "string";
    }).map(function (d) {
      return {
        date: d.date,
        messages: Math.max(0, Math.floor(Number(d.messages) || 0)),
        joins: Math.max(0, Math.floor(Number(d.joins) || 0)),
        leaves: Math.max(0, Math.floor(Number(d.leaves) || 0))
      };
    }).slice(-30);
  }

  function renderHero(detail, fallbackName) {
    var guild = (detail && detail.guild) || {};
    var counts = (detail && detail.counts) || {};
    $("guild-title").textContent = guild.name || fallbackName || "Server";
    try { document.title = ($("guild-title").textContent || "Server") + " — Pannello"; } catch (e) {}
    var parts = [];
    if (typeof guild.memberCount === "number") parts.push(fmtNum(guild.memberCount) + " membri");
    if (counts.channels) parts.push(counts.channels + " canali");
    if (counts.roles) parts.push(counts.roles + " ruoli");
    $("guild-sub").textContent = parts.join(" · ") || ("ID " + (guild.id || ""));
    var icon = $("guild-hero-icon");
    clear(icon);
    if (guild.icon) {
      var img = document.createElement("img");
      img.src = guild.icon;
      img.alt = "";
      icon.appendChild(img);
    } else {
      icon.textContent = initials(guild.name || fallbackName);
    }
    refreshStatusPills();
  }

  /* ---------- Panoramica server: grafico + stat ---------- */
  function sumKey(rows, key) {
    return rows.reduce(function (a, r) { return a + (r[key] || 0); }, 0);
  }

  function deltaLabel(rows) {
    if (rows.length < 14) return null;
    var last7 = sumKey(rows.slice(-7), "messages");
    var prev7 = sumKey(rows.slice(-14, -7), "messages");
    if (prev7 === 0) return last7 > 0 ? "settimana in crescita" : null;
    var pct = Math.round(((last7 - prev7) / prev7) * 100);
    if (pct === 0) return "stabile su 7 giorni";
    return (pct > 0 ? "+" : "") + pct + "% su 7 giorni";
  }

  function statCard(iconName, label, value, sub) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var top = document.createElement("div");
    top.className = "stat-top";
    top.appendChild(iconEl(iconName));
    var kk = document.createElement("span");
    kk.className = "k";
    kk.textContent = label;
    top.appendChild(kk);
    card.appendChild(top);
    var vv = document.createElement("div");
    vv.className = "v";
    card.appendChild(vv);
    if (typeof value === "number") {
      vv.textContent = "0";
      animateValue(vv, value);
    } else {
      vv.textContent = String(value);
    }
    if (sub) {
      var ss = document.createElement("div");
      ss.className = "stat-sub";
      ss.textContent = sub;
      card.appendChild(ss);
    }
    return card;
  }

  function renderDetail(detail) {
    var stats = (detail && detail.stats) || {};
    var counts = (detail && detail.counts) || {};
    var trends = state.trends;
    var lock = state.modulesCache && state.modulesCache.lockdown;
    if (lock && lock.active) {
      toast("Lockdown attivo: disattivalo con /lockdown off nel server.", "err");
    }
    renderChart(trends);
    var box = $("stats");
    clear(box);
    var msg30 = sumKey(trends, "messages");
    var join30 = sumKey(trends, "joins");
    var leave30 = sumKey(trends, "leaves");
    var hasTrends = trends.length > 0 && (msg30 > 0 || join30 > 0 || leave30 > 0);
    var sub = [];
    if (typeof counts.channels === "number") sub.push(counts.channels + " canali");
    if (typeof counts.roles === "number") sub.push(counts.roles + " ruoli");
    box.appendChild(statCard("users", "Membri", typeof counts.members === "number" ? counts.members : "—", sub.join(" · ") || null));
    box.appendChild(statCard("message", "Messaggi (30g)", hasTrends ? msg30 : fmtNum(stats.analytics && stats.analytics.messages) || "—", deltaLabel(trends)));
    box.appendChild(statCard("plus", "Ingressi (30g)", hasTrends ? join30 : "—", null));
    box.appendChild(statCard("trash", "Uscite (30g)", hasTrends ? leave30 : "—", null));
    var openT = (stats.openTickets !== undefined && stats.openTickets !== null) ? stats.openTickets : "—";
    box.appendChild(statCard("ticket", "Ticket aperti", openT, null));
    var autoN = (state.listsCache.autoresponder || []).length + (state.listsCache.customCommands || []).length;
    box.appendChild(statCard("terminal", "Automazioni", autoN, (state.listsCache.levelRewards || []).length + " ricompense"));
    renderTopList($("top-levels"), stats.levels, function (e) {
      return (e.username || e.tag || e.id) + " · livello " + (e.level !== undefined ? e.level : "?");
    });
    renderTopList($("top-eco"), stats.economy, function (e) {
      return (e.username || e.tag || e.id) + " · " + fmtNum(e.balance) + " monete";
    });
  }

  function renderTopList(ol, arr, fmt) {
    if (!ol) return;
    clear(ol);
    if (!Array.isArray(arr) || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessun dato per ora.";
      ol.appendChild(li);
      return;
    }
    arr.slice(0, 5).forEach(function (e, i) {
      var li2 = document.createElement("li");
      var pos = document.createElement("span");
      pos.className = "rank-pos";
      pos.textContent = (i + 1) + ".";
      li2.appendChild(pos);
      var tx = document.createElement("span");
      tx.textContent = fmt(e);
      li2.appendChild(tx);
      ol.appendChild(li2);
    });
  }

  /* ---------- Grafico 30 giorni (SVG, zero dipendenze) ---------- */
  function shortDay(iso) {
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1];
  }

  function chartPath(pts) {
    if (pts.length === 0) return "";
    if (pts.length === 1) return "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    return "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L");
  }

  function elNS(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  function renderChart(trends) {
    var wrap = $("chart-wrap");
    clear(wrap);
    var tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.id = "chart-tip";
    tip.hidden = true;
    wrap.appendChild(tip);
    var W = 640, H = 240, PL = 44, PR = 44, PT = 14, PB = 28;
    var iw = W - PL - PR, ih = H - PT - PB;
    var svg = elNS("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    var totalMsg = sumKey(trends, "messages");
    var net = sumKey(trends, "joins") - sumKey(trends, "leaves");
    var summary = $("chart-summary");
    if (trends.length === 0 || (totalMsg === 0 && net === 0)) {
      svg.setAttribute("aria-label", "Nessun dato di attività negli ultimi 30 giorni.");
      var tx = elNS("text", { x: W / 2, y: H / 2 - 6, "text-anchor": "middle", class: "chart-empty" });
      tx.textContent = "Ancora nessun dato";
      svg.appendChild(tx);
      var tx2 = elNS("text", { x: W / 2, y: H / 2 + 16, "text-anchor": "middle", class: "chart-empty-sub" });
      tx2.textContent = "I conteggi partono da oggi";
      svg.appendChild(tx2);
      wrap.appendChild(svg);
      if (summary) summary.textContent = "Messaggi, ingressi e uscite giornalieri.";
      return;
    }
    var maxMsg = 0, maxP = 0, i;
    for (i = 0; i < trends.length; i++) {
      if (trends[i].messages > maxMsg) maxMsg = trends[i].messages;
      var p = Math.max(trends[i].joins, trends[i].leaves);
      if (p > maxP) maxP = p;
    }
    if (maxMsg === 0) maxMsg = 1;
    if (maxP === 0) maxP = 1;
    function X(idx) { return PL + (trends.length === 1 ? iw / 2 : (idx / (trends.length - 1)) * iw); }
    function Ym(v) { return PT + ih - (v / maxMsg) * ih; }
    function Yp(v) { return PT + ih - (v / maxP) * ih; }
    svg.setAttribute("aria-label", "Attività ultimi 30 giorni: " + fmtNum(totalMsg) + " messaggi, saldo membri " + (net >= 0 ? "+" : "") + net + ".");
    var g;
    for (g = 0; g <= 3; g++) {
      var gy = PT + (ih / 3) * g;
      svg.appendChild(elNS("line", { x1: PL, y1: gy, x2: W - PR, y2: gy, class: "grid" }));
      var gl = elNS("text", { x: PL - 6, y: gy + 4, "text-anchor": "end", class: "axis" });
      gl.textContent = fmtCompact(Math.round(maxMsg - (maxMsg / 3) * g));
      svg.appendChild(gl);
      var gr = elNS("text", { x: W - PR + 6, y: gy + 4, "text-anchor": "start", class: "axis" });
      gr.textContent = fmtCompact(Math.round(maxP - (maxP / 3) * g));
      svg.appendChild(gr);
    }
    var pts = [], pj = [], pl = [];
    for (i = 0; i < trends.length; i++) {
      pts.push([X(i), Ym(trends[i].messages)]);
      pj.push([X(i), Yp(trends[i].joins)]);
      pl.push([X(i), Yp(trends[i].leaves)]);
    }
    var area = elNS("path", { d: chartPath(pts) + " L" + X(trends.length - 1).toFixed(1) + "," + (PT + ih) + " L" + X(0).toFixed(1) + "," + (PT + ih) + " Z", class: "area-msg" });
    svg.appendChild(area);
    svg.appendChild(elNS("path", { d: chartPath(pts), class: "line-msg" }));
    svg.appendChild(elNS("path", { d: chartPath(pj), class: "line-join" }));
    svg.appendChild(elNS("path", { d: chartPath(pl), class: "line-leave" }));
    if (trends.length === 1) {
      var single = [[pts[0], "dot-msg"], [pj[0], "dot-join"], [pl[0], "dot-leave"]];
      single.forEach(function (pair) {
        svg.appendChild(elNS("circle", { cx: pair[0][0], cy: pair[0][1], r: 4, class: pair[1] }));
      });
    }
    for (i = 0; i < trends.length; i += 5) {
      var txl = elNS("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "axis" });
      txl.textContent = shortDay(trends[i].date);
      svg.appendChild(txl);
    }
    var cursor = elNS("line", { y1: PT, y2: PT + ih, class: "cursor", visibility: "hidden" });
    svg.appendChild(cursor);
    var dots = ["dot-msg", "dot-join", "dot-leave"].map(function (c) {
      var d = elNS("circle", { r: 3.5, class: c, visibility: "hidden" });
      svg.appendChild(d);
      return d;
    });
    var hit = elNS("rect", { x: PL, y: PT, width: iw, height: ih, class: "hit" });
    svg.appendChild(hit);
    var kbIdx = trends.length - 1;
    function showTip(idx, clientX, clientY) {
      idx = Math.max(0, Math.min(trends.length - 1, idx));
      kbIdx = idx;
      var d = trends[idx];
      cursor.setAttribute("x1", X(idx));
      cursor.setAttribute("x2", X(idx));
      cursor.setAttribute("visibility", "visible");
      var vals = [d.messages, d.joins, d.leaves];
      dots.forEach(function (dot, k) {
        var y = k === 0 ? Ym(vals[k]) : Yp(vals[k]);
        dot.setAttribute("cx", X(idx));
        dot.setAttribute("cy", y);
        dot.setAttribute("visibility", "visible");
      });
      clear(tip);
      var dt = document.createElement("div");
      dt.className = "tip-date";
      dt.textContent = shortDay(d.date);
      tip.appendChild(dt);
      [["Messaggi", d.messages, "sw-msg"], ["Ingressi", d.joins, "sw-join"], ["Uscite", d.leaves, "sw-leave"]].forEach(function (row) {
        var line = document.createElement("div");
        line.className = "tip-row";
        var sw = document.createElement("span");
        sw.className = "sw " + row[2];
        line.appendChild(sw);
        var lb = document.createElement("span");
        lb.textContent = row[0];
        line.appendChild(lb);
        var vv = document.createElement("strong");
        vv.textContent = fmtNum(row[1]);
        line.appendChild(vv);
        tip.appendChild(line);
      });
      tip.hidden = false;
      var wr = wrap.getBoundingClientRect();
      var lx = (clientX !== undefined ? clientX - wr.left : (X(idx) / W) * wr.width) + 12;
      var ly = (clientY !== undefined ? clientY - wr.top : 20) - 10;
      var maxL = Math.max(4, wr.width - 140);
      tip.style.left = Math.min(Math.max(lx, 4), maxL) + "px";
      tip.style.top = Math.max(ly, 0) + "px";
    }
    function hideTip() {
      tip.hidden = true;
      cursor.setAttribute("visibility", "hidden");
      dots.forEach(function (dot) { dot.setAttribute("visibility", "hidden"); });
    }
    function idxFromEvent(ev) {
      var r = svg.getBoundingClientRect();
      var cx = (ev.clientX - r.left) / r.width * W;
      var rel = (cx - PL) / iw * (trends.length - 1);
      return Math.round(rel);
    }
    hit.addEventListener("mousemove", function (ev) { showTip(idxFromEvent(ev), ev.clientX, ev.clientY); });
    hit.addEventListener("mouseleave", hideTip);
    hit.addEventListener("click", function (ev) { showTip(idxFromEvent(ev), ev.clientX, ev.clientY); });
    svg.setAttribute("tabindex", "0");
    svg.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ev.preventDefault();
        kbIdx += ev.key === "ArrowRight" ? 1 : -1;
        kbIdx = Math.max(0, Math.min(trends.length - 1, kbIdx));
        showTip(kbIdx);
      } else if (ev.key === "Escape") {
        hideTip();
      }
    });
    wrap.appendChild(svg);
    if (summary) {
      summary.textContent = fmtNum(totalMsg) + " messaggi · saldo membri " +
        (net >= 0 ? "+" : "") + fmtNum(net) + " (" + fmtNum(sumKey(trends, "joins")) +
        " ingressi, " + fmtNum(sumKey(trends, "leaves")) + " uscite)";
    }
  }
  /* ---------- Stato moduli (on/off dai valori reali) ---------- */
  function moduleStatus(modName) {
    var v = (state.modulesCache && state.modulesCache[modName]) || {};
    switch (modName) {
      case "general":
        return Boolean(v.logChannelId || v.suggestChannelId);
      case "welcome":
        return Boolean(v.welcomeChannelId || v.goodbyeChannelId);
      case "automod":
        return Boolean(v.enabled);
      case "autorole":
        return Boolean(v.enabled && Array.isArray(v.roleIds) && v.roleIds.length > 0);
      case "levels":
        return v.levelupEnabled !== false;
      case "tickets":
        return Boolean(v.logChannelId);
      case "ticketsPlus":
        return Boolean(v.panelChannelId);
      case "tempvoice":
        return Boolean(v.lobbyChannelId);
      case "ai":
        return Boolean(v.mentionReply || v.automodAI || v.ticketAI || v.funAI);
      case "aiPlus":
        return Array.isArray(v.mentionChannels) && v.mentionChannels.length > 0;
      case "starboard":
        return Boolean(v.channelId);
      case "confessioni":
        return Boolean(v.channelId);
      case "reactionRoles":
        return Boolean(v.channelId);
      case "logging":
        return Boolean(v.logChannelId);
      default:
        return false;
    }
  }

  function statusPill(on) {
    var s = document.createElement("span");
    s.className = "mod-status" + (on ? " st-on" : "");
    s.textContent = on ? "Attivo" : "Spento";
    return s;
  }

  function refreshStatusPills() {
    var txt = (typeof state.apiMs === "number") ? "Online · " + state.apiMs + " ms" : "Online";
    [["home-status", true], ["server-status", !!state.gid]].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      el.hidden = !pair[1];
      var t = el.querySelector(".status-txt");
      if (t) t.textContent = txt;
    });
  }

  /* ---------- Moduli: un modulo alla volta ---------- */
  function sectionOf(mod) {
    return mod.section || "Altro";
  }

  function editableModules() {
    return state.schema.filter(function (m) { return !m.custom && m.module !== "logging"; });
  }

  function moduleMatches(mod, q) {
    if (!q) return true;
    var hay = ((mod.title || "") + " " + (mod.description || "") + " " + sectionOf(mod) + " " +
      (mod.fields || []).map(function (f) { return (f.label || "") + " " + (f.key || ""); }).join(" ")).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function filteredModules() {
    var q = state.modSearch.trim().toLowerCase();
    return editableModules().filter(function (m) {
      if (state.moduleSection !== "all" && sectionOf(m) !== state.moduleSection) return false;
      return moduleMatches(m, q);
    });
  }

  function buildModuleSections() {
    var box = $("module-sections");
    clear(box);
    var counts = {};
    editableModules().forEach(function (m) {
      var s = sectionOf(m);
      counts[s] = (counts[s] || 0) + 1;
    });
    var sections = Object.keys(counts);
    [{ v: "all", l: "Tutte" }].concat(sections.map(function (s) { return { v: s, l: s }; })).forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (state.moduleSection === o.v ? " is-active" : "");
      b.textContent = o.v === "all" ? o.l : o.l + " · " + counts[o.v];
      b.setAttribute("aria-pressed", state.moduleSection === o.v ? "true" : "false");
      b.addEventListener("click", function () {
        state.moduleSection = o.v;
        buildModuleSections();
        renderModuleNav();
        renderActiveModule();
      });
      box.appendChild(b);
    });
  }

  function renderModuleNav() {
    var nav = $("module-nav");
    clear(nav);
    var list = filteredModules();
    if (state.activeModule && list.every(function (m) { return m.module !== state.activeModule; })) {
      state.activeModule = list.length ? list[0].module : null;
    }
    if (!state.activeModule && list.length) state.activeModule = list[0].module;
    if (list.length === 0) {
      var p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "Nessun modulo trovato.";
      nav.appendChild(p);
      return;
    }
    list.forEach(function (mod) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mod-item" + (state.activeModule === mod.module ? " is-active" : "");
      b.dataset.module = mod.module;
      b.setAttribute("aria-current", state.activeModule === mod.module ? "true" : "false");
      b.appendChild(iconEl(MODULE_ICONS[mod.module] || "sliders"));
      var tx = document.createElement("span");
      tx.className = "mod-item-txt";
      var tt = document.createElement("span");
      tt.className = "mod-item-title";
      tt.textContent = mod.title || mod.module;
      tx.appendChild(tt);
      var ss = document.createElement("span");
      ss.className = "mod-item-sec";
      ss.textContent = sectionOf(mod);
      tx.appendChild(ss);
      b.appendChild(tx);
      b.appendChild(statusPill(moduleStatus(mod.module)));
      var chev = iconEl("chev");
      chev.classList.add("mod-chev");
      b.appendChild(chev);
      if (state.dirtyModules[mod.module]) {
        var dot = document.createElement("span");
        dot.className = "dirty-dot";
        dot.setAttribute("aria-label", "Modifiche non salvate");
        b.appendChild(dot);
      }
      b.addEventListener("click", function () {
        state.activeModule = mod.module;
        renderModuleNav();
        renderActiveModule();
      });
      nav.appendChild(b);
    });
  }

  function fieldControl(modName, field, current) {
    var type = field.type;
    var input;
    if (type === "bool") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(current);
    } else if (type === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      var range = NUMBER_RANGES[field.key];
      if (range) {
        input.min = String(range[0]);
        input.max = String(range[1]);
      }
      if (current !== undefined && current !== null) input.value = String(current);
    } else if (type === "lang") {
      input = document.createElement("select");
      var opts = field.options || [{ value: "it", label: "Italiano" }, { value: "en", label: "English" }];
      opts.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        if (String(current) === String(o.value)) opt.selected = true;
        input.appendChild(opt);
      });
    } else if (type === "roles") {
      input = document.createElement("div");
      input.className = "roles-checks";
      var roles = (state.meta.roles || []).filter(function (r) { return !r.managed; });
      var sel = Array.isArray(current) ? current.map(String) : [];
      if (roles.length === 0) {
        input.textContent = "Nessun ruolo disponibile.";
      }
      roles.forEach(function (r) {
        var label = document.createElement("label");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = r.id;
        cb.checked = sel.indexOf(String(r.id)) !== -1;
        var span = document.createElement("span");
        span.textContent = r.name;
        label.appendChild(cb);
        label.appendChild(span);
        input.appendChild(label);
      });
    } else if (type === "channel" || type === "role") {
      input = document.createElement("select");
      var list = type === "channel" ? (state.meta.channels || []) : (state.meta.roles || []);
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "— seleziona —";
      input.appendChild(none);
      var noSet = document.createElement("option");
      noSet.value = NONE_VALUE;
      noSet.textContent = "Nessuno (disattiva)";
      input.appendChild(noSet);
      (list || []).forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.id || o.value || "";
        opt.textContent = o.name || o.label || opt.value;
        if (current !== undefined && current !== null && String(current) === String(opt.value) && opt.value !== "") opt.selected = true;
        input.appendChild(opt);
      });
      if (current === null || current === undefined) input.value = NONE_VALUE;
    } else if (type === "emoji") {
      input = document.createElement("input");
      input.type = "text";
      input.value = current !== undefined && current !== null ? String(current) : "";
      input.maxLength = 50;
    } else {
      var limit = TEXT_LIMITS[field.key] || DEFAULT_TEXT_MAX;
      if (field.multiline) {
        input = document.createElement("textarea");
        input.value = current !== undefined && current !== null ? String(current) : "";
        input.maxLength = limit;
        if (field.placeholder) input.placeholder = field.placeholder;
        var wrapT = document.createElement("div");
        wrapT.className = "textarea-wrap";
        wrapT.appendChild(input);
        wrapT.appendChild(attachCounter(input, limit));
        input.id = "f-" + modName + "-" + field.key;
        input.name = field.key;
        input.dataset.fkey = field.key;
        input.dataset.ftype = type;
        return wrapT;
      }
      input = document.createElement("input");
      input.type = "text";
      input.value = current !== undefined && current !== null ? String(current) : "";
      input.maxLength = limit;
      if (field.placeholder) input.placeholder = field.placeholder;
    }
    input.id = "f-" + modName + "-" + field.key;
    input.name = field.key;
    input.dataset.fkey = field.key;
    input.dataset.ftype = type;
    return input;
  }

  function attachCounter(input, limit) {
    var counter = document.createElement("div");
    counter.className = "char-counter muted small";
    var update = function () { counter.textContent = String(input.value.length) + "/" + limit; };
    input.addEventListener("input", update);
    update();
    return counter;
  }

  function pokeCounter(input) {
    try {
      var ev;
      if (typeof Event === "function") ev = new Event("input", { bubbles: true });
      else { ev = document.createEvent("Event"); ev.initEvent("input", true, false); }
      input.dispatchEvent(ev);
    } catch (e) { /* contatore non critico */ }
  }

  function renderActiveModule() {
    var box = $("modules");
    clear(box);
    var mod = null;
    editableModules().forEach(function (m) { if (m.module === state.activeModule) mod = m; });
    if (!mod) {
      box.appendChild(emptyBox("grid", "Seleziona un modulo", "Scegli un modulo dalla lista per modificarlo.", null));
      return;
    }
    var card = document.createElement("form");
    card.className = "mod-form";
    card.dataset.module = mod.module;
    var head = document.createElement("div");
    head.className = "mod-form-head";
    head.appendChild(iconEl(MODULE_ICONS[mod.module] || "sliders"));
    var ht = document.createElement("div");
    var h = document.createElement("h3");
    h.textContent = mod.title || mod.module;
    ht.appendChild(h);
    if (mod.description) {
      var d = document.createElement("p");
      d.className = "muted small";
      d.textContent = mod.description;
      ht.appendChild(d);
    }
    head.appendChild(ht);
    head.appendChild(statusPill(moduleStatus(mod.module)));
    card.appendChild(head);
    var cached = (state.modulesCache && state.modulesCache[mod.module]) || {};
    var values = state.pending[mod.module] || cached;
    (mod.fields || []).forEach(function (field) {
      var wrap = document.createElement("div");
      wrap.className = "field" + (field.type === "bool" ? " toggle" : "");
      var label = document.createElement("label");
      label.textContent = field.label || field.key;
      var ctl = fieldControl(mod.module, field, values[field.key]);
      var inner = (ctl.className === "textarea-wrap") ? ctl.querySelector("[data-fkey]") : ctl;
      label.htmlFor = (inner || ctl).id;
      wrap.appendChild(label);
      wrap.appendChild(ctl);
      if (field.help) {
        var help = document.createElement("div");
        help.className = "muted small";
        help.textContent = field.help;
        wrap.appendChild(help);
      }
      card.appendChild(wrap);
    });
    card.addEventListener("submit", function (ev) {
      ev.preventDefault();
      saveAllDirty();
    });
    card.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t && t.dataset && t.dataset.fkey) {
        clearFieldError(t);
        state.pending[mod.module] = readValues(card);
        syncDirty(mod.module);
        renderModuleNavDots();
        updateDirtyBar();
      }
    });
    card.addEventListener("change", function () {
      state.pending[mod.module] = readValues(card);
      syncDirty(mod.module);
      renderModuleNavDots();
      updateDirtyBar();
    });
    box.appendChild(card);
    state.baseline[mod.module] = JSON.stringify(valuesInOrder(mod.module, cached));
    syncDirty(mod.module);
    updateDirtyBar();
  }

  function renderModuleSection() {
    buildModuleSections();
    var list = filteredModules();
    if (!state.activeModule || list.every(function (m) { return m.module !== state.activeModule; })) {
      state.activeModule = list.length ? list[0].module : null;
    }
    renderModuleNav();
    renderActiveModule();
  }

  function formOf(modName) {
    return document.querySelector('#modules form[data-module="' + modName + '"]');
  }

  function readValues(form) {
    var out = {};
    form.querySelectorAll("[data-fkey]").forEach(function (ctl) {
      out[ctl.dataset.fkey] = readControlValue(ctl);
    });
    return out;
  }

  function defaultForType(type) {
    if (type === "bool") return false;
    if (type === "number") return null;
    if (type === "roles") return [];
    if (type === "channel" || type === "role") return null;
    return "";
  }

  function valuesInOrder(modName, src) {
    var spec = null;
    state.schema.forEach(function (m) { if (m.module === modName) spec = m; });
    var out = {};
    ((spec && spec.fields) || []).forEach(function (f) {
      var v = src ? src[f.key] : undefined;
      out[f.key] = (v === undefined) ? defaultForType(f.type) : v;
    });
    return out;
  }

  function syncDirty(mod) {
    if (state.pending[mod] && JSON.stringify(valuesInOrder(mod, state.pending[mod])) !== state.baseline[mod]) {
      state.dirtyModules[mod] = true;
    } else {
      delete state.dirtyModules[mod];
      if (state.pending[mod] && JSON.stringify(valuesInOrder(mod, state.pending[mod])) === state.baseline[mod]) {
        delete state.pending[mod];
      }
    }
  }

  function readControlValue(ctl) {
    var t = ctl.dataset.ftype;
    if (!t && ctl.className === "roles-checks") t = "roles";
    if (t === "bool") return ctl.checked;
    if (t === "number") {
      if (ctl.value === "") return null;
      var n = Number(ctl.value);
      if (isNaN(n) || !isFinite(n)) return ctl.value;
      return Math.floor(n);
    }
    if (t === "roles") {
      var checked = ctl.querySelectorAll('input[type="checkbox"]:checked');
      return Array.prototype.map.call(checked, function (cb) { return cb.value; });
    }
    if (t === "channel" || t === "role") {
      if (ctl.value === NONE_VALUE) return null;
      return ctl.value;
    }
    return ctl.value;
  }

  function renderModuleNavDots() {
    document.querySelectorAll("#module-nav .mod-item").forEach(function (b) {
      var has = b.querySelector(".dirty-dot");
      if (state.dirtyModules[b.dataset.module]) {
        if (!has) {
          var dot = document.createElement("span");
          dot.className = "dirty-dot";
          dot.setAttribute("aria-label", "Modifiche non salvate");
          b.appendChild(dot);
        }
      } else if (has) {
        has.parentNode.removeChild(has);
      }
    });
  }

  function dirtyCount() {
    return Object.keys(state.dirtyModules).length + Object.keys(state.dirtyPerms).length;
  }

  function dirtyLabel(n) {
    if (n === 1) return "1 modifica non salvata";
    return n + " modifiche non salvate";
  }

  function updateDirtyBar() {
    var bar = $("dirty-bar");
    var n = dirtyCount();
    bar.hidden = n === 0;
    if (n > 0) $("dirty-count").textContent = dirtyLabel(n);
  }

  function setFieldError(ctl, msg) {
    ctl.setAttribute("aria-invalid", "true");
    var id = (ctl.id || "f") + "-err";
    var p = document.getElementById(id);
    if (!p) {
      p = document.createElement("p");
      p.className = "field-error";
      p.id = id;
      if (ctl.parentNode) ctl.parentNode.appendChild(p);
    }
    p.textContent = msg;
    var described = ctl.getAttribute("aria-describedby") || "";
    if (described.indexOf(id) === -1) {
      ctl.setAttribute("aria-describedby", (described ? described + " " : "") + id);
    }
  }

  function clearFieldError(ctl) {
    ctl.removeAttribute("aria-invalid");
    var id = (ctl.id || "f") + "-err";
    var p = document.getElementById(id);
    if (p && p.parentNode) p.parentNode.removeChild(p);
    var described = ctl.getAttribute("aria-describedby") || "";
    described = described.split(" ").filter(function (x) { return x && x !== id; }).join(" ");
    if (described) ctl.setAttribute("aria-describedby", described);
    else ctl.removeAttribute("aria-describedby");
  }

  function validateModule(modName, form) {
    var spec = null;
    state.schema.forEach(function (m) { if (m.module === modName) spec = m; });
    var fields = spec ? (spec.fields || []) : [];
    var byKey = {};
    fields.forEach(function (f) { byKey[f.key] = f; });
    var controls = form.querySelectorAll("[data-fkey]");
    for (var i = 0; i < controls.length; i++) {
      var ctl = controls[i];
      clearFieldError(ctl);
      var key = ctl.dataset.fkey;
      var ftype = ctl.dataset.ftype;
      var val = readControlValue(ctl);
      var label = (byKey[key] && (byKey[key].label || byKey[key].key)) || key;
      if (ftype === "number") {
        if (val === null || typeof val !== "number") {
          return { ctl: ctl, msg: label + ": inserisci un numero valido." };
        }
        var range = NUMBER_RANGES[key];
        if (range && (val < range[0] || val > range[1])) {
          return { ctl: ctl, msg: label + ": deve stare tra " + range[0] + " e " + range[1] + "." };
        }
      } else if (ftype === "text") {
        var limit = TEXT_LIMITS[key] || DEFAULT_TEXT_MAX;
        if (String(val).length > limit) {
          return { ctl: ctl, msg: label + ": supera il limite di " + limit + " caratteri." };
        }
      } else if (ftype === "channel" || ftype === "role") {
        if (val === "") {
          return { ctl: ctl, msg: label + ": scegli un valore oppure Nessuno." };
        }
        if (val !== null && !/^\d{10,25}$/.test(String(val))) {
          return { ctl: ctl, msg: label + ": valore non valido." };
        }
      } else if (ftype === "emoji") {
        if (!String(val).trim()) {
          return { ctl: ctl, msg: label + ": inserisci un emoji." };
        }
      }
    }
    return null;
  }

  function modTitle(modName) {
    var t = modName;
    state.schema.forEach(function (m) { if (m.module === modName && m.title) t = m.title; });
    return t;
  }

  function focusModule(modName) {
    if (state.activeTab !== "moduli") switchTab("moduli");
    state.activeModule = modName;
    renderModuleNav();
    renderActiveModule();
  }

  function setBarSaving(saving) {
    $("dirty-save").disabled = saving;
    $("dirty-discard").disabled = saving;
    $("dirty-save").textContent = saving ? "Salvataggio…" : "Salva tutto";
  }

  function validatePendingValues(modName, values) {
    var spec = null;
    state.schema.forEach(function (m) { if (m.module === modName) spec = m; });
    var fields = spec ? (spec.fields || []) : [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var val = values ? values[f.key] : undefined;
      if (val === undefined) val = defaultForType(f.type);
      var label = f.label || f.key;
      if (f.type === "number") {
        if (val === null || typeof val !== "number" || !isFinite(val)) {
          return { key: f.key, msg: label + ": inserisci un numero valido." };
        }
        var range = NUMBER_RANGES[f.key];
        if (range && (val < range[0] || val > range[1])) {
          return { key: f.key, msg: label + ": deve stare tra " + range[0] + " e " + range[1] + "." };
        }
      } else if (f.type === "text") {
        var limit = TEXT_LIMITS[f.key] || DEFAULT_TEXT_MAX;
        if (String(val === null || val === undefined ? "" : val).length > limit) {
          return { key: f.key, msg: label + ": supera il limite di " + limit + " caratteri." };
        }
      } else if (f.type === "channel" || f.type === "role") {
        if (val === "") {
          return { key: f.key, msg: label + ": scegli un valore oppure Nessuno." };
        }
        if (val !== null && !/^\d{10,25}$/.test(String(val))) {
          return { key: f.key, msg: label + ": valore non valido." };
        }
      } else if (f.type === "emoji") {
        if (!String(val === null || val === undefined ? "" : val).trim()) {
          return { key: f.key, msg: label + ": inserisci un emoji." };
        }
      }
    }
    return null;
  }

  function saveAllDirty() {
    var mods = Object.keys(state.dirtyModules);
    var cmds = Object.keys(state.dirtyPerms);
    if (mods.length === 0 && cmds.length === 0) return;
    if (state.activeModule) {
      var activeForm = formOf(state.activeModule);
      if (activeForm) {
        state.pending[state.activeModule] = readValues(activeForm);
        syncDirty(state.activeModule);
        mods = Object.keys(state.dirtyModules);
      }
    }
    for (var i = 0; i < mods.length; i++) {
      var body0 = valuesInOrder(mods[i], state.pending[mods[i]]);
      var bad0 = validatePendingValues(mods[i], body0);
      if (bad0) {
        focusModule(mods[i]);
        var form = formOf(mods[i]);
        if (form) {
          var bad = validateModule(mods[i], form);
          if (bad) {
            setFieldError(bad.ctl, bad.msg);
            bad.ctl.focus();
            toast(bad.msg, "err");
            return;
          }
        }
        toast(bad0.msg, "err");
        return;
      }
    }
    var resetCmds = cmds.filter(function (c) {
      var draft = state.permsDraft[c] || [];
      var base = state.permsBaseline[c] || [];
      return draft.length === 0 && base.length > 0;
    });
    for (var k = 0; k < cmds.length; k++) {
      if ((state.permsDraft[cmds[k]] || []).length > 5) {
        switchTab("permessi");
        toast("Troppi ruoli per " + cmds[k] + ": massimo 5 per comando.", "err");
        return;
      }
    }
    var chain = Promise.resolve();
    if (resetCmds.length > 0) {
      chain = chain.then(function () {
        return openConfirm("Rimuovere i limiti",
          "Rimuovere ogni limite per " + resetCmds.join(", ") + "? Torneranno ai permessi Discord standard.");
      }).then(function (ok) {
        if (!ok) throw new Error("cancelled");
      });
    }
    setBarSaving(true);
    mods.forEach(function (modName) {
      chain = chain.then(function () {
        var body = valuesInOrder(modName, state.pending[modName]);
        var m = modName;
        return putModule(m, body).then(function () {
          state.modulesCache[modName] = body;
          state.baseline[modName] = JSON.stringify(body);
          delete state.pending[modName];
          delete state.dirtyModules[modName];
          updateDirtyBar();
          renderModuleNavDots();
        });
      });
    });
    cmds.forEach(function (cmd) {
      chain = chain.then(function () {
        return putPermRow(cmd);
      });
    });
    chain.then(function () {
      renderModuleNav();
      toast("Modifiche salvate.", "ok");
    }).catch(function (err) {
      if (err && (err.message === "unauthorized" || err.message === "cancelled")) return;
      toast("Errore di salvataggio: " + err.message, "err");
    }).then(function () {
      setBarSaving(false);
      updateDirtyBar();
    });
  }

  function discardAllDirty() {
    var n = dirtyCount();
    if (n === 0) return;
    openConfirm("Annullare le modifiche", "Annullare " + dirtyLabel(n) + "? I valori torneranno agli ultimi salvati.").then(function (ok) {
      if (!ok) return;
      state.pending = {};
      state.dirtyModules = {};
      renderModuleNav();
      renderActiveModule();
      renderMatrixFromDraft(true);
      updateDirtyBar();
      toast("Modifiche annullate.", "ok");
    });
  }

  function initDirtyBar() {
    $("dirty-save").addEventListener("click", saveAllDirty);
    $("dirty-discard").addEventListener("click", discardAllDirty);
  }
  /* ---------- Liste (aggiunta diretta, modale solo per eliminare) ---------- */
  function renderLists(lists) {
    renderAR(lists.autoresponder);
    renderCC(lists.customCommands);
    renderRW(lists.levelRewards);
    renderShop(lists.shop);
  }

  function deleteBtn(label, onClick) {
    var del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn danger";
    del.setAttribute("aria-label", label);
    del.setAttribute("title", label);
    del.innerHTML = ICONS.trash;
    del.addEventListener("click", onClick);
    return del;
  }

  function setSaving(btn, saving) {
    if (!btn) return;
    btn.disabled = saving;
    if (saving) {
      btn.dataset.label = btn.textContent;
      btn.textContent = "Attendi…";
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
    }
  }

  function renderAR(arr) {
    var ul = $("ar-list");
    clear(ul);
    if (!arr || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessuna risposta automatica. Aggiungi la prima qui sotto.";
      ul.appendChild(li);
      return;
    }
    arr.forEach(function (t) {
      var li2 = document.createElement("li");
      li2.className = "itemrow";
      var txt = document.createElement("span");
      var mode = t.mode && t.mode !== "include" ? " [" + t.mode + "]" : "";
      txt.textContent = "«" + t.match + "» → " + String(t.response).slice(0, 80) + mode;
      li2.appendChild(txt);
      li2.appendChild(deleteBtn("Elimina risposta per " + t.match, function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Elimina risposta", "Eliminare la risposta per «" + t.match + "»?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modAR = "autoresponder";
          putModule(modAR, { action: "remove", id: t.id })
            .then(function (r) {
              state.listsCache.autoresponder = (r && r.list) || [];
              renderAR(state.listsCache.autoresponder);
              toast("Risposta eliminata.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li2);
    });
  }

  function renderCC(arr) {
    var ul = $("cc-list");
    clear(ul);
    if (!arr || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessun comando personalizzato (massimo 20).";
      ul.appendChild(li);
      return;
    }
    arr.forEach(function (c) {
      var li2 = document.createElement("li");
      li2.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = "!" + c.name + " → " + String(c.response || "").slice(0, 80);
      li2.appendChild(txt);
      li2.appendChild(deleteBtn("Elimina comando !" + c.name, function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Elimina comando", "Eliminare il comando !" + c.name + "?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modCC = "commands";
          putModule(modCC, { action: "remove", name: c.name })
            .then(function (r) {
              state.listsCache.customCommands = (r && r.list) || [];
              renderCC(state.listsCache.customCommands);
              syncMatrixCommands();
              toast("Comando eliminato.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li2);
    });
  }

  function roleName(id) {
    var r = (state.meta.roles || []).filter(function (x) { return String(x.id) === String(id); })[0];
    return r ? r.name : id;
  }

  function renderRW(arr) {
    var ul = $("rw-list");
    clear(ul);
    if (!arr || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessuna ricompensa. Abbina un ruolo a un livello qui sotto.";
      ul.appendChild(li);
      return;
    }
    arr.forEach(function (r) {
      var li2 = document.createElement("li");
      li2.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = "Livello " + r.level + " → " + roleName(r.roleId);
      li2.appendChild(txt);
      li2.appendChild(deleteBtn("Elimina ricompensa livello " + r.level, function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Elimina ricompensa", "Eliminare la ricompensa del livello " + r.level + "?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modRW = "rewards";
          putModule(modRW, { action: "remove", level: r.level })
            .then(function (res) {
              state.listsCache.levelRewards = (res && res.list) || [];
              renderRW(state.listsCache.levelRewards);
              toast("Ricompensa eliminata.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li2);
    });
  }

  function renderShop(arr) {
    var ul = $("sh-list");
    clear(ul);
    if (!arr || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Negozio vuoto: metti in vendita il primo ruolo qui sotto.";
      ul.appendChild(li);
      return;
    }
    arr.forEach(function (it) {
      var li2 = document.createElement("li");
      li2.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = roleName(it.roleId) + " → " + fmtNum(it.price) + " monete";
      li2.appendChild(txt);
      li2.appendChild(deleteBtn("Rimuovi dal negozio " + roleName(it.roleId), function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Rimuovi dal negozio", "Rimuovere " + roleName(it.roleId) + " dal negozio?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modSh = "shop";
          putModule(modSh, { action: "remove", roleId: it.roleId })
            .then(function () { return refreshShop(); })
            .then(function () { toast("Oggetto rimosso.", "ok"); })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li2);
    });
  }

  function refreshShop() {
    return getJSON("/api/guilds/" + encodeURIComponent(state.gid)).then(function (detail) {
      state.listsCache.shop = (detail && detail.lists && detail.lists.shop) || [];
      renderShop(state.listsCache.shop);
    });
  }

  function fillRoleSelect(selId, emptyLabel) {
    var sel = $(selId);
    clear(sel);
    var usable = (state.meta.roles || []).filter(function (r) { return !r.managed; });
    if (usable.length === 0) {
      var o = document.createElement("option");
      o.value = "";
      o.textContent = emptyLabel || "Nessun ruolo disponibile";
      sel.appendChild(o);
      return;
    }
    usable.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
  }

  function buildRewardRoles(roles) {
    fillRoleSelect("rw-role");
    void roles;
  }

  function buildShopRoles() {
    fillRoleSelect("sh-role");
  }

  function initListForms() {
    attachCounter($("ar-match"), 200);
    attachCounter($("ar-response"), 1500);
    attachCounter($("cc-name"), 20);
    attachCounter($("cc-response"), 1500);
    $("ar-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var match = $("ar-match").value.trim();
      var response = $("ar-response").value.trim();
      if (!match || !response) { toast("Parola e risposta sono obbligatorie.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modAdd = "autoresponder";
      putModule(modAdd, { action: "add", match: match, response: response })
        .then(function (r) {
          state.listsCache.autoresponder = (r && r.list) || state.listsCache.autoresponder;
          renderAR(state.listsCache.autoresponder);
          $("ar-match").value = "";
          $("ar-response").value = "";
          pokeCounter($("ar-match"));
          pokeCounter($("ar-response"));
          toast("Risposta aggiunta.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });
    $("cc-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var name = $("cc-name").value.trim().toLowerCase();
      var response = $("cc-response").value.trim();
      if (!/^[a-z0-9-]{2,20}$/.test(name)) { toast("Nome non valido: 2-20 caratteri (a-z, 0-9, -).", "err"); return; }
      if (!response) { toast("La risposta è obbligatoria.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modCreate = "commands";
      putModule(modCreate, { action: "create", name: name, response: response })
          .then(function (r) {
            state.listsCache.customCommands = (r && r.list) || state.listsCache.customCommands;
            renderCC(state.listsCache.customCommands);
            syncMatrixCommands();
            $("cc-name").value = "";
          $("cc-response").value = "";
          pokeCounter($("cc-name"));
          pokeCounter($("cc-response"));
          toast("Comando !" + name + " salvato.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });
    $("rw-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var level = Math.floor(Number($("rw-level").value));
      var roleId = $("rw-role").value;
      if (!Number.isFinite(level) || level < 1 || level > 100) { toast("Livello non valido (1-100).", "err"); return; }
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modSet = "rewards";
      putModule(modSet, { action: "set", level: level, roleId: roleId })
        .then(function (r) {
          state.listsCache.levelRewards = (r && r.list) || state.listsCache.levelRewards;
          renderRW(state.listsCache.levelRewards);
          $("rw-level").value = "";
          toast("Ricompensa salvata.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });
    $("sh-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var roleId = $("sh-role").value;
      var price = Math.floor(Number($("sh-price").value));
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      if (!Number.isFinite(price) || price < 1 || price > 10000000) { toast("Prezzo non valido (1-10.000.000).", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modShop = "shop";
      putModule(modShop, { action: "set", roleId: roleId, price: price })
        .then(function () { return refreshShop(); })
        .then(function () {
          $("sh-price").value = "";
          toast("Oggetto in vendita.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });
  }

  /* ---------- Permessi: matrice comandi × ruoli ---------- */
  function permCommands() {
    var cmds = PERM_COMMANDS.slice();
    (state.listsCache.customCommands || []).forEach(function (c) {
      var n = "!" + c.name;
      if (cmds.indexOf(n) === -1) cmds.push(n);
    });
    return cmds;
  }

  function usableRoles() {
    return (state.meta.roles || []).filter(function (r) { return !r.managed; }).slice(0, 24);
  }

  function permsToMap(perms) {
    var map = {};
    if (!perms) return map;
    if (Array.isArray(perms)) {
      perms.forEach(function (p) {
        var cmd = p.command || p.name;
        if (cmd) map[cmd] = Array.isArray(p.roleIds) ? p.roleIds.map(String) : [];
      });
      return map;
    }
    Object.keys(perms).forEach(function (cmd) {
      var v = perms[cmd];
      map[cmd] = Array.isArray(v) ? v.map(String) : [];
    });
    return map;
  }

  function syncMatrixCommands() {
    if (!state.gid || $("guild-detail").hidden) return;
    var cmds = permCommands();
    var changed = false;
    cmds.forEach(function (cmd) {
      if (!state.permsDraft[cmd]) {
        state.permsDraft[cmd] = (state.permsBaseline[cmd] || []).slice();
        changed = true;
      }
    });
    Object.keys(state.permsDraft).forEach(function (cmd) {
      if (cmds.indexOf(cmd) === -1) {
        delete state.permsDraft[cmd];
        delete state.permsBaseline[cmd];
        delete state.dirtyPerms[cmd];
        changed = true;
      }
    });
    if (changed) {
      renderMatrixFromDraft(false);
      updateDirtyBar();
    }
  }

  function renderMatrix(perms) {
    var map = permsToMap(perms);
    state.permsBaseline = {};
    state.permsDraft = {};
    state.dirtyPerms = {};
    permCommands().forEach(function (cmd) {
      var ids = (map[cmd] || []).slice().sort();
      state.permsBaseline[cmd] = ids;
      state.permsDraft[cmd] = ids.slice();
    });
    renderMatrixFromDraft(false);
    updateDirtyBar();
  }

  function sameIds(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function renderMatrixFromDraft(reset) {
    var head = $("perms-head");
    var body = $("perms-body");
    clear(head);
    clear(body);
    var roles = usableRoles();
    var cmds = permCommands();
    if (reset) {
      state.permsDraft = {};
      cmds.forEach(function (cmd) {
        state.permsDraft[cmd] = (state.permsBaseline[cmd] || []).slice();
      });
      Object.keys(state.permsBaseline).forEach(function (cmd) {
        if (cmds.indexOf(cmd) === -1) delete state.permsBaseline[cmd];
      });
      state.dirtyPerms = {};
    }
    var hr = document.createElement("tr");
    var corner = document.createElement("th");
    corner.className = "m-corner";
    corner.setAttribute("scope", "col");
    corner.textContent = "Comando";
    hr.appendChild(corner);
    roles.forEach(function (r) {
      var th = document.createElement("th");
      th.className = "m-role";
      th.setAttribute("scope", "col");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "m-role-btn";
      b.title = "Attiva/disattiva " + r.name + " per tutti i comandi";
      b.textContent = r.name;
      b.addEventListener("click", function () { toggleMatrixColumn(r.id); });
      th.appendChild(b);
      hr.appendChild(th);
    });
    head.appendChild(hr);
    if (roles.length === 0) {
      var er = document.createElement("tr");
      var ed = document.createElement("td");
      ed.colSpan = 2;
      ed.className = "muted";
      ed.textContent = "Nessun ruolo disponibile in questo server.";
      er.appendChild(ed);
      body.appendChild(er);
      return;
    }
    cmds.forEach(function (cmd) {
      var tr = document.createElement("tr");
      if (state.dirtyPerms[cmd]) tr.className = "is-dirty";
      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      var rb = document.createElement("button");
      rb.type = "button";
      rb.className = "m-cmd-btn";
      rb.title = "Attiva/disattiva tutti i ruoli per " + cmd;
      rb.textContent = cmd;
      rb.addEventListener("click", function () { toggleMatrixRow(cmd); });
      th.appendChild(rb);
      tr.appendChild(th);
      var draft = state.permsDraft[cmd] || [];
      roles.forEach(function (r) {
        var td = document.createElement("td");
        td.className = "m-cell";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = draft.indexOf(String(r.id)) !== -1;
        cb.setAttribute("aria-label", r.name + " può usare " + cmd);
        cb.addEventListener("change", function () {
          var d = state.permsDraft[cmd] || [];
          var id = String(r.id);
          var ix = d.indexOf(id);
          if (cb.checked && ix === -1) d.push(id);
          if (!cb.checked && ix !== -1) d.splice(ix, 1);
          d.sort();
          state.permsDraft[cmd] = d;
          if (sameIds(d, state.permsBaseline[cmd] || [])) delete state.dirtyPerms[cmd];
          else state.dirtyPerms[cmd] = true;
          tr.classList.toggle("is-dirty", !!state.dirtyPerms[cmd]);
          updateDirtyBar();
        });
        td.appendChild(cb);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function toggleMatrixRow(cmd) {
    var roles = usableRoles().map(function (r) { return String(r.id); });
    var d = state.permsDraft[cmd] || [];
    var all = roles.length > 0 && roles.every(function (id) { return d.indexOf(id) !== -1; });
    state.permsDraft[cmd] = all ? [] : roles.slice().sort();
    if (sameIds(state.permsDraft[cmd], state.permsBaseline[cmd] || [])) delete state.dirtyPerms[cmd];
    else state.dirtyPerms[cmd] = true;
    renderMatrixFromDraft(false);
    updateDirtyBar();
  }

  function toggleMatrixColumn(roleId) {
    var id = String(roleId);
    var cmds = permCommands();
    var all = cmds.length > 0 && cmds.every(function (c) {
      return (state.permsDraft[c] || []).indexOf(id) !== -1;
    });
    cmds.forEach(function (c) {
      var d = state.permsDraft[c] || [];
      var ix = d.indexOf(id);
      if (all && ix !== -1) d.splice(ix, 1);
      if (!all && ix === -1) d.push(id);
      d.sort();
      state.permsDraft[c] = d;
      if (sameIds(d, state.permsBaseline[c] || [])) delete state.dirtyPerms[c];
      else state.dirtyPerms[c] = true;
    });
    renderMatrixFromDraft(false);
    updateDirtyBar();
  }

  function putPermRow(cmd) {
    var draft = (state.permsDraft[cmd] || []).slice();
    return putJSON("/api/guilds/" + encodeURIComponent(state.gid) + "/perms", {
      command: cmd,
      roleIds: draft
    }).then(function () {
      state.permsBaseline[cmd] = draft.slice().sort();
      delete state.dirtyPerms[cmd];
      renderMatrixFromDraft(false);
      updateDirtyBar();
    });
  }

  /* ---------- Filtri ---------- */
  function initFilters() {
    document.querySelectorAll(".chips .chip[data-filter]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.filter = chip.dataset.filter;
        document.querySelectorAll(".chips .chip[data-filter]").forEach(function (c) {
          var on = c === chip;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderGuildList();
      });
    });
    $("guild-search").addEventListener("input", function (ev) {
      state.search = ev.target.value || "";
      renderGuildList();
    });
    $("module-search").addEventListener("input", function (ev) {
      state.modSearch = ev.target.value || "";
      renderModuleNav();
      var first = filteredModules()[0];
      if (first && (!state.activeModule || filteredModules().every(function (m) { return m.module !== state.activeModule; }))) {
        state.activeModule = first.module;
        renderModuleNav();
        renderActiveModule();
      }
    });
  }

  /* ---------- boot ---------- */
  function initHashLink() {
    window.addEventListener("hashchange", function () {
      var gid = readHashGid();
      if (!gid || gid === state.gid || state.guilds.length === 0) return;
      var found = state.guilds.filter(function (g) { return g && g.id === gid && g.botPresent; })[0];
      if (found && dirtyCount() === 0) selectGuild(found.id, found.name);
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    initConfirm();
    initNav();
    initFilters();
    initShortcut();
    initHashLink();
    initDirtyBar();
    initListForms();
    buildTabs();
    showDetail(false);
    setStatus("Connessione…");
    showGuildSkeletons();
    showPanelSkeletons();
    loadMe()
      .then(loadGuilds)
      .then(function () { setStatus(""); })
      .catch(function (err) {
        if (err && err.message === "unauthorized") return;
        clearBusy();
        setStatus("Errore: " + (err && err.message ? err.message : err) + " — accedi da /login.");
      });
  });
})();