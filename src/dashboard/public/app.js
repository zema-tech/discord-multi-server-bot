(function () {
  "use strict";

  var PERM_COMMANDS = [
    "ban", "kick", "timeout", "warn", "clear", "slowmode",
    "lock", "nuke", "giveaway", "poll", "ticket",
    "setup", "embed", "evento", "template"
  ];

  var TABS = [
    { id: "panoramica", label: "Panoramica" },
    { id: "moduli", label: "Moduli" },
    { id: "liste", label: "Liste" },
    { id: "permessi", label: "Permessi" }
  ];

  var TAB_ICONS = { panoramica: "📊", moduli: "🧩", liste: "📝", permessi: "🔐" };

  var state = {
    gid: null,
    guilds: [],
    filter: "all",
    search: "",
    meta: { channels: [], roles: [] },
    modulesCache: {},
    listsCache: { autoresponder: [], customCommands: [], levelRewards: [] },
    schema: [],
    activeTab: "panoramica",
    moduleSection: "all"
  };

  var NUMBER_RANGES = { maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90], maxCapsPercent: [10, 100], threshold: [1, 100], delaySeconds: [0, 3600] };
  var TEXT_LIMITS = { welcomeMessage: 500, goodbyeMessage: 500, systemPrompt: 1000, badWords: 1000 };
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
    var fill = document.createElement("span");
    bar.appendChild(fill);
    el.appendChild(bar);
    var kill = function () {
      if (!el.parentNode) return;
      if (prefersReduced()) {
        if (el.parentNode) el.parentNode.removeChild(el);
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

  function animateValue(el, target) {
    var num = Number(target);
    if (!isFinite(num) || prefersReduced()) {
      el.textContent = fmtNum(target);
      return;
    }
    var start = 0;
    var dur = 750;
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(Math.round(start + (num - start) * eased));
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
    var mods = $("modules");
    clear(mods);
    mods.setAttribute("aria-busy", "true");
    for (var j = 0; j < 2; j++) {
      var m = document.createElement("div");
      m.className = "card is-loading";
      m.setAttribute("aria-hidden", "true");
      m.appendChild(skeletonLine("40%"));
      var g2 = document.createElement("div");
      g2.style.height = "0.8rem";
      m.appendChild(g2);
      m.appendChild(skeletonLine("100%"));
      mods.appendChild(m);
    }
  }

  function clearBusy() {
    ["guild-list", "stats", "modules"].forEach(function (id) {
      var el = $(id);
      if (el) el.setAttribute("aria-busy", "false");
    });
  }

  /* ---------- Modale di conferma ---------- */
  var confirmResolve = null;

  function renderConfirmMsg(msg) {
    var box = $("confirm-msg");
    clear(box);
    var re = /«([^»]+)»/g;
    var last = 0;
    var m;
    var found = false;
    while ((m = re.exec(String(msg))) !== null) {
      found = true;
      if (m.index > last) box.appendChild(document.createTextNode(String(msg).slice(last, m.index)));
      var hl = document.createElement("strong");
      hl.className = "hl";
      hl.textContent = m[1];
      box.appendChild(hl);
      last = m.index + m[0].length;
    }
    if (!found) {
      box.textContent = msg;
      return;
    }
    if (last < String(msg).length) box.appendChild(document.createTextNode(String(msg).slice(last)));
  }

  function openConfirm(message) {
    return new Promise(function (resolve) {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      renderConfirmMsg(message);
      $("confirm-title").textContent = "Confermi il salvataggio?";
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
      ev.preventDefault();
      if (isMobileNav() && !document.body.classList.contains("nav-open")) openNav();
      $("guild-search").focus();
    });
  }

  /* ---------- Profilo ---------- */
  function loadMe() {
    return getJSON("/api/me").then(function (me) {
      var name = me.username || me.tag || me.name || "Utente";
      $("user-name").textContent = name;
      $("user-sub").textContent = me.id ? "ID " + me.id : "connesso";
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
      $("user-sub").textContent = "vai a /login";
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

  function emptyGuilds(list, guilds) {
    clear(list);
    list.setAttribute("aria-busy", "false");
    var li = document.createElement("li");
    var box = document.createElement("div");
    box.className = "empty-state";
    var ico = document.createElement("span");
    ico.className = "empty-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.textContent = "🤖";
    var strong = document.createElement("strong");
    var hint = document.createElement("p");
    var manageable = (guilds || []).filter(function (g) { return g && g.canManage; });
    if (manageable.length > 0) {
      strong.textContent = "Nessun server con il bot presente";
      hint.textContent = "Aggiungi il bot a uno dei tuoi server (devi avere il permesso Gestisci Server), poi ricarica questa pagina.";
    } else {
      strong.textContent = "Nessun server gestibile";
      hint.textContent = "Aggiungi il bot al tuo server Discord e assicurati di avere il permesso Gestisci Server, poi accedi di nuovo.";
    }
    var cta = document.createElement("div");
    cta.className = "empty-cta";
    var login = document.createElement("a");
    login.className = "btn btn-primary btn-sm";
    login.href = "/login";
    login.textContent = "Accedi di nuovo";
    var home = document.createElement("a");
    home.className = "btn btn-secondary btn-sm";
    home.href = "/";
    home.textContent = "← Landing";
    cta.appendChild(login);
    cta.appendChild(home);
    box.appendChild(ico);
    box.appendChild(strong);
    box.appendChild(hint);
    box.appendChild(cta);
    li.appendChild(box);
    li.style.listStyle = "none";
    list.appendChild(li);
  }

  function guildIconEl(g, big) {
    var icon = document.createElement("span");
    icon.className = "guild-icon" + (big ? " guild-icon-lg" : "");
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

  function fmtMembers(n) {
    if (typeof n !== "number") return null;
    if (n >= 1000) return (Math.round(n / 100) / 10).toLocaleString("it-IT") + "k";
    return String(n);
  }

  function renderGuildList() {
    var list = $("guild-list");
    clear(list);
    list.setAttribute("aria-busy", "false");
    var withBot = state.guilds.filter(function (g) { return g && g.botPresent; });
    var manageable = state.guilds.filter(function (g) { return g && g.canManage; });
    $("guild-count").textContent = withBot.length + "/" + manageable.length;
    var items = filteredGuilds();
    if (state.guilds.length === 0) {
      emptyGuilds(list, state.guilds);
      return;
    }
    if (items.length === 0) {
      var li0 = document.createElement("li");
      li0.style.listStyle = "none";
      var box0 = document.createElement("div");
      box0.className = "empty-state";
      var ico0 = document.createElement("span");
      ico0.className = "empty-ico";
      ico0.setAttribute("aria-hidden", "true");
      ico0.textContent = "🔍";
      var s0 = document.createElement("strong");
      s0.textContent = "Nessun server per questo filtro";
      var p0 = document.createElement("p");
      p0.textContent = "Prova a cambiare filtro o a cancellare la ricerca (scorciatoia: /).";
      box0.appendChild(ico0);
      box0.appendChild(s0);
      box0.appendChild(p0);
      li0.appendChild(box0);
      list.appendChild(li0);
      return;
    }
    items.forEach(function (g) {
      var li = document.createElement("li");
      if (g.botPresent) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "guild-btn";
        btn.setAttribute("aria-current", g.id === state.gid ? "true" : "false");
        btn.dataset.gid = g.id;
        btn.setAttribute("aria-label", "Configura " + (g.name || g.id));
        btn.appendChild(guildIconEl(g, false));
        var txt = document.createElement("span");
        txt.className = "guild-txt";
        var nm = document.createElement("span");
        nm.className = "guild-name";
        nm.textContent = g.name || g.id;
        txt.appendChild(nm);
        var sub = document.createElement("span");
        sub.className = "guild-sub";
        sub.textContent = (g.memberCount !== null && g.memberCount !== undefined)
          ? fmtNum(g.memberCount) + " membri" : "Gestisci →";
        txt.appendChild(sub);
        btn.appendChild(txt);
        if (typeof g.memberCount === "number") {
          var mb = document.createElement("span");
          mb.className = "member-badge";
          mb.textContent = fmtMembers(g.memberCount) || "";
          mb.setAttribute("aria-hidden", "true");
          btn.appendChild(mb);
        }
        var badge = document.createElement("span");
        badge.className = "badge badge-ok";
        badge.textContent = "BOT";
        btn.appendChild(badge);
        btn.addEventListener("click", function () { selectGuild(g.id, g.name); });
        li.appendChild(btn);
      } else if (g.canManage && g.inviteUrl) {
        var wrap = document.createElement("div");
        wrap.className = "guild-btn guild-missing";
        wrap.appendChild(guildIconEl(g, false));
        var txt2 = document.createElement("span");
        txt2.className = "guild-txt";
        var nm2 = document.createElement("span");
        nm2.className = "guild-name";
        nm2.textContent = g.name || g.id;
        txt2.appendChild(nm2);
        var sub2 = document.createElement("span");
        sub2.className = "guild-sub";
        sub2.textContent = "Bot non presente";
        txt2.appendChild(sub2);
        wrap.appendChild(txt2);
        var add = document.createElement("a");
        add.className = "btn btn-primary btn-sm";
        add.href = g.inviteUrl;
        add.target = "_blank";
        add.rel = "noopener";
        add.textContent = "+ Aggiungi";
        add.setAttribute("aria-label", "Aggiungi il bot a " + (g.name || g.id));
        wrap.appendChild(add);
        li.appendChild(wrap);
      } else {
        return;
      }
      list.appendChild(li);
    });
  }

  function loadGuilds() {
    return getJSON("/api/guilds").then(function (guilds) {
      state.guilds = Array.isArray(guilds) ? guilds : [];
      renderGuildList();
      renderOverview();
      var deep = readHashGid();
      if (deep) {
        var found = state.guilds.filter(function (g) { return g && g.id === deep && g.botPresent; })[0];
        if (found) selectGuild(found.id, found.name);
      }
    });
  }

  function markActiveGuild() {
    var btns = document.querySelectorAll(".guild-btn");
    btns.forEach(function (b) {
      if (b.dataset && b.dataset.gid) {
        b.setAttribute("aria-current", b.dataset.gid === state.gid ? "true" : "false");
      }
    });
  }

  /* ---------- Panoramica account ---------- */
  function overviewStatCard(icon, k, raw, animate) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var kk = document.createElement("div");
    kk.className = "k";
    kk.textContent = icon + " " + k;
    var vv = document.createElement("div");
    vv.className = "v";
    card.appendChild(kk);
    card.appendChild(vv);
    if (animate && typeof raw === "number") {
      vv.textContent = "0";
      animateValue(vv, raw);
    } else {
      vv.textContent = typeof raw === "number" ? fmtNum(raw) : String(raw);
    }
    return card;
  }

  function renderOverview() {
    var withBot = state.guilds.filter(function (g) { return g.botPresent; });
    var missing = state.guilds.filter(function (g) { return g.canManage && !g.botPresent; });
    var members = withBot.reduce(function (acc, g) {
      return acc + (typeof g.memberCount === "number" ? g.memberCount : 0);
    }, 0);
    var box = $("overview-stats");
    clear(box);
    box.appendChild(overviewStatCard("🖥️", "Server con bot", withBot.length, true));
    box.appendChild(overviewStatCard("👥", "Membri totali", members, true));
    box.appendChild(overviewStatCard("➕", "Da aggiungere", missing.length, true));
    var grid = $("overview-grid");
    clear(grid);
    if (withBot.length === 0 && missing.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      var ei = document.createElement("span");
      ei.className = "empty-ico";
      ei.setAttribute("aria-hidden", "true");
      ei.textContent = "✦";
      var es = document.createElement("strong");
      es.textContent = "Collega il primo server";
      var ep = document.createElement("p");
      ep.textContent = "Seleziona un server dalla sidebar per sbloccare moduli, liste e permessi. Il backend li ordina già: prima quelli con il bot.";
      var cta = document.createElement("div");
      cta.className = "empty-cta";
      var b1 = document.createElement("a");
      b1.className = "btn btn-primary btn-sm";
      b1.href = "/login";
      b1.textContent = "Accedi con Discord";
      cta.appendChild(b1);
      empty.appendChild(ei);
      empty.appendChild(es);
      empty.appendChild(ep);
      empty.appendChild(cta);
      grid.appendChild(empty);
      return;
    }
    withBot.slice(0, 6).forEach(function (g) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "card ov-card";
      var top = document.createElement("div");
      top.className = "ov-top";
      top.appendChild(guildIconEl(g, false));
      var nm = document.createElement("strong");
      nm.textContent = g.name || g.id;
      top.appendChild(nm);
      card.appendChild(top);
      var meta = document.createElement("div");
      meta.className = "muted small";
      meta.textContent = (g.memberCount !== null && g.memberCount !== undefined)
        ? fmtNum(g.memberCount) + " membri · clicca per configurare" : "Clicca per configurare";
      card.appendChild(meta);
      card.addEventListener("click", function () { selectGuild(g.id, g.name); });
      grid.appendChild(card);
    });
    if (missing.length > 0) {
      var miss = document.createElement("div");
      miss.className = "card";
      var h = document.createElement("h3");
      h.textContent = "➕ Porta il bot negli altri server";
      miss.appendChild(h);
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
          a.textContent = "Aggiungi";
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
    var ind = $("tab-indicator");
    clear(nav);
    if (ind) nav.appendChild(ind);
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (state.activeTab === t.id ? " is-active" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", state.activeTab === t.id ? "true" : "false");
      b.dataset.tab = t.id;
      var ico = document.createElement("span");
      ico.setAttribute("aria-hidden", "true");
      ico.textContent = (TAB_ICONS[t.id] || "") + " ";
      b.appendChild(ico);
      b.appendChild(document.createTextNode(t.label));
      b.addEventListener("click", function () { switchTab(t.id); });
      nav.appendChild(b);
    });
    updateTabIndicator();
  }

  function updateTabIndicator() {
    var nav = $("tabs");
    var ind = $("tab-indicator");
    if (!nav || !ind) return;
    var active = nav.querySelector(".tab.is-active");
    if (!active) { ind.style.width = "0px"; return; }
    var left = active.offsetLeft || 0;
    var w = active.offsetWidth || 0;
    ind.style.width = w + "px";
    ind.style.transform = "translateX(" + left + "px)";
  }

  function switchTab(id) {
    state.activeTab = id;
    buildTabs();
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.hidden = p.dataset.tabpanel !== id;
    });
    updateTabIndicator();
  }

  function showDetail(show) {
    $("guild-detail").hidden = !show;
    $("overview-panel").hidden = show;
    $("guild-hero").hidden = !show;
    $("guild-hero-empty").hidden = show;
    $("guild-hero").classList.toggle("is-empty", !show);
  }

  /* ---------- Selezione server ---------- */
  function selectGuild(gid, fallbackName) {
    state.gid = gid;
    state.activeTab = "panoramica";
    writeHashGid(gid);
    markActiveGuild();
    if (isMobileNav()) closeNav();
    setStatus("Caricamento dati server…");
    showDetail(true);
    buildTabs();
    switchTab("panoramica");
    var heroIcon = $("guild-hero-icon");
    clear(heroIcon);
    heroIcon.textContent = initials(fallbackName);
    $("guild-title").textContent = fallbackName || "Server " + gid;
    $("guild-sub").textContent = "Caricamento…";
    try { document.title = (fallbackName || "Server") + " — Dashboard"; } catch (e) {}
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
      renderHero(detail, fallbackName);
      renderDetail(detail);
      renderSchema(state.schema, state.modulesCache);
      renderLists(state.listsCache);
      renderPerms(detail && detail.perms);
      buildPermCommandSelect(detail);
      buildPermRoles(state.meta.roles);
      buildRewardRoles(state.meta.roles);
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
      levelRewards: (lists && Array.isArray(lists.levelRewards)) ? lists.levelRewards : []
    };
  }

  function renderHero(detail, fallbackName) {
    var guild = (detail && detail.guild) || {};
    var counts = (detail && detail.counts) || {};
    $("guild-title").textContent = guild.name || fallbackName || "Server";
    try { document.title = ($("guild-title").textContent || "Server") + " — Dashboard"; } catch (e) {}
    var parts = [];
    if (guild.memberCount !== null && guild.memberCount !== undefined) parts.push(fmtNum(guild.memberCount) + " membri");
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
  }

  /* ---------- Statistiche server ---------- */
  function statCard(k, v, raw) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var kk = document.createElement("div");
    kk.className = "k";
    kk.textContent = k;
    var vv = document.createElement("div");
    vv.className = "v small-v";
    card.appendChild(kk);
    card.appendChild(vv);
    if (typeof raw === "number") {
      vv.textContent = "0";
      animateValue(vv, raw);
    } else {
      vv.textContent = v;
    }
    return card;
  }

  function renderDetail(detail) {
    var stats = (detail && detail.stats) || {};
    var counts = (detail && detail.counts) || {};
    var box = $("stats");
    clear(box);
    var lock = state.modulesCache && state.modulesCache.lockdown;
    if (lock && lock.active) {
      var banner = document.createElement("div");
      banner.className = "alert-banner";
      banner.setAttribute("role", "alert");
      var bt = document.createElement("strong");
      bt.textContent = "🔒 Lockdown attivo";
      banner.appendChild(bt);
      banner.appendChild(document.createTextNode(" — "));
      var bd = document.createElement("span");
      bd.textContent = (lock.motivo ? lock.motivo + " · " : "") + "disattivalo con /lockdown off nel server.";
      banner.appendChild(bd);
      box.appendChild(banner);
    }
    box.appendChild(statCard("Membri", fmtNum(counts.members), typeof counts.members === "number" ? counts.members : null));
    box.appendChild(statCard("Canali", fmtNum(counts.channels), typeof counts.channels === "number" ? counts.channels : null));
    box.appendChild(statCard("Ruoli", fmtNum(counts.roles), typeof counts.roles === "number" ? counts.roles : null));
    var analytics = stats.analytics || {};
    var msgRaw = (analytics.messages !== undefined && analytics.messages !== null) ? Number(analytics.messages) : null;
    box.appendChild(statCard("Messaggi (7g)", fmtNum(analytics.messages), isFinite(msgRaw) ? msgRaw : null));
    var openT = (stats.openTickets !== undefined && stats.openTickets !== null)
      ? stats.openTickets : "-";
    box.appendChild(statCard("Ticket aperti", String(openT), typeof openT === "number" ? openT : null));
    box.appendChild(statCard("Trigger auto", String((state.listsCache.autoresponder || []).length), (state.listsCache.autoresponder || []).length));
    box.appendChild(statCard("Comandi !", String((state.listsCache.customCommands || []).length), (state.listsCache.customCommands || []).length));
    renderTopList($("top-levels"), stats.levels, function (e) {
      return (e.username || e.tag || e.id) + " · " + (e.level !== undefined ? "Lv " + e.level : fmtNum(e.xp) + " XP");
    });
    renderTopList($("top-eco"), stats.economy, function (e) {
      return (e.username || e.tag || e.id) + " · " + fmtNum(e.balance) + " 🪙";
    });
  }

  function renderTopList(ol, arr, fmt) {
    clear(ol);
    if (!Array.isArray(arr) || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessun dato ancora.";
      ol.appendChild(li);
      return;
    }
    arr.slice(0, 5).forEach(function (e, i) {
      var li2 = document.createElement("li");
      var medal = ["🥇", "🥈", "🥉", "4.", "5."][i] || (i + 1) + ".";
      li2.textContent = medal + " " + fmt(e);
      ol.appendChild(li2);
    });
  }

  /* ---------- Editor moduli ---------- */
  function channelOptions(type) {
    var all = state.meta.channels || [];
    if (type !== "channel") return all;
    return all;
  }

  function attachCounter(input, limit) {
    var counter = document.createElement("div");
    counter.className = "char-counter muted small";
    var update = function () { counter.textContent = String(input.value.length) + "/" + limit; };
    input.addEventListener("input", update);
    update();
    return counter;
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
      input.required = true;
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
      input.required = true;
      var list = type === "channel" ? channelOptions(type) : state.meta.roles;
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
      input.value = current !== undefined && current !== null ? String(current) : "⭐";
      input.maxLength = 50;
    } else {
      var limit = TEXT_LIMITS[field.key] || DEFAULT_TEXT_MAX;
      if (field.multiline) {
        input = document.createElement("textarea");
        input.value = current !== undefined && current !== null ? String(current) : "";
        input.maxLength = limit;
        if (field.placeholder) input.placeholder = field.placeholder;
        var counter = document.createElement("div");
        counter.className = "char-counter muted small";
        var update = function () { counter.textContent = String(input.value.length) + "/" + limit; };
        input.addEventListener("input", update);
        update();
        var wrapT = document.createElement("div");
        wrapT.appendChild(input);
        wrapT.appendChild(counter);
        wrapT.className = "textarea-wrap";
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

  function sectionOf(mod) {
    return mod.section || "Altro";
  }

  function buildModuleFilter() {
    var box = $("module-filter");
    clear(box);
    var sections = [];
    state.schema.forEach(function (m) {
      var s = sectionOf(m);
      if (sections.indexOf(s) === -1) sections.push(s);
    });
    var all = document.createElement("button");
    all.type = "button";
    all.className = "chip" + (state.moduleSection === "all" ? " is-active" : "");
    all.textContent = "Tutti";
    all.setAttribute("aria-pressed", state.moduleSection === "all" ? "true" : "false");
    all.addEventListener("click", function () {
      state.moduleSection = "all";
      buildModuleFilter();
      renderSchema(state.schema, state.modulesCache);
    });
    box.appendChild(all);
    sections.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (state.moduleSection === s ? " is-active" : "");
      b.textContent = s;
      b.setAttribute("aria-pressed", state.moduleSection === s ? "true" : "false");
      b.addEventListener("click", function () {
        state.moduleSection = s;
        buildModuleFilter();
        renderSchema(state.schema, state.modulesCache);
      });
      box.appendChild(b);
    });
  }

  function renderSchema(schema, modulesCache) {
    buildModuleFilter();
    var box = $("modules");
    clear(box);
    var list = schema.filter(function (m) {
      if (m.custom) return false;
      if (state.moduleSection !== "all" && sectionOf(m) !== state.moduleSection) return false;
      return true;
    });
    if (list.length === 0) {
      var p = document.createElement("p");
      p.className = "status-line";
      p.textContent = "Nessun modulo in questa sezione.";
      box.appendChild(p);
      return;
    }
    list.forEach(function (mod) {
      var card = document.createElement("form");
      card.className = "card mod-card";
      card.dataset.module = mod.module;
      card.dataset.section = sectionOf(mod);
      var top = document.createElement("div");
      top.className = "mod-top";
      top.setAttribute("aria-hidden", "true");
      card.appendChild(top);
      var body = document.createElement("div");
      body.className = "mod-body";

      var head = document.createElement("div");
      head.className = "mod-head";
      var h = document.createElement("h3");
      h.textContent = (mod.icon ? mod.icon + " " : "") + (mod.title || mod.module);
      head.appendChild(h);
      var sec = document.createElement("span");
      sec.className = "badge badge-sec";
      sec.textContent = sectionOf(mod);
      head.appendChild(sec);
      body.appendChild(head);
      if (mod.description) {
        var d = document.createElement("p");
        d.className = "muted small";
        d.textContent = mod.description;
        body.appendChild(d);
      }

      var values = (modulesCache && modulesCache[mod.module]) || {};
      (mod.fields || []).forEach(function (field) {
        var wrap = document.createElement("div");
        wrap.className = "field" + (field.type === "bool" ? " toggle" : "");
        var label = document.createElement("label");
        label.textContent = field.label || field.key;
        var ctl = fieldControl(mod.module, field, values[field.key]);
        var inner = (ctl.className === "textarea-wrap") ? ctl.querySelector("[data-fkey]") : ctl;
        label.htmlFor = ctl.id || (inner && inner.id);
        if (field.help && !field.multiline) {
          var help = document.createElement("div");
          help.className = "muted small";
          help.textContent = field.help;
          wrap.appendChild(label);
          wrap.appendChild(ctl);
          wrap.appendChild(help);
        } else if (field.type === "bool") {
          wrap.appendChild(label);
          wrap.appendChild(ctl);
        } else {
          wrap.appendChild(label);
          wrap.appendChild(ctl);
        }
        body.appendChild(wrap);
      });

      var save = document.createElement("button");
      save.type = "submit";
      save.className = "btn btn-primary btn-sm";
      save.textContent = "Salva " + (mod.title || mod.module);
      body.appendChild(save);
      card.appendChild(body);

      card.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveModule(mod.module, card, save);
      });

      card.addEventListener("input", function (ev) {
        var t = ev.target;
        if (t && t.dataset && t.dataset.fkey) clearFieldError(t);
      });

      box.appendChild(card);
    });
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
          return { ctl: ctl, msg: label + ": seleziona un valore o «Nessuno»." };
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

  function setSaving(btn, saving) {
    if (!btn) return;
    btn.disabled = saving;
    if (saving) {
      btn.dataset.label = btn.textContent;
      btn.textContent = "Salvataggio…";
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
    }
  }

  function saveModule(modName, form, btn) {
    var bad = validateModule(modName, form);
    if (bad) {
      setFieldError(bad.ctl, bad.msg);
      bad.ctl.focus();
      toast(bad.msg, "err");
      return;
    }
    var title = modName;
    state.schema.forEach(function (m) { if (m.module === modName && m.title) title = m.title; });
    openConfirm("Salvare le modifiche al modulo «" + title + "»?").then(function (ok) {
      if (!ok) return;
      var body = {};
      var controls = form.querySelectorAll("[data-fkey]");
      controls.forEach(function (ctl) {
        body[ctl.dataset.fkey] = readControlValue(ctl);
      });
      setSaving(btn, true);
      var m = modName;
      putModule(m, body)
        .then(function () {
          state.modulesCache[modName] = body;
          toast("Modulo " + modName + " salvato.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore salvataggio " + modName + ": " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });
  }

  /* ---------- Liste ---------- */
  function renderLists(lists) {
    renderAR(lists.autoresponder);
    renderCC(lists.customCommands);
    renderRW(lists.levelRewards);
  }

  function renderAR(arr) {
    var ul = $("ar-list");
    clear(ul);
    if (!arr || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessun trigger: aggiungi la prima risposta qui sotto.";
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
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-secondary btn-sm";
      del.textContent = "Elimina";
      del.setAttribute("aria-label", "Elimina trigger " + t.match);
      del.addEventListener("click", function () {
        openConfirm("Eliminare la risposta per «" + t.match + "»?").then(function (ok) {
          if (!ok) return;
          setSaving(del, true);
          var modAR = "autoresponder";
          putModule(modAR, { action: "remove", id: t.id })
            .then(function (r) {
              state.listsCache.autoresponder = (r && r.list) || [];
              renderAR(state.listsCache.autoresponder);
              toast("Trigger eliminato.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { setSaving(del, false); });
        });
      });
      li2.appendChild(del);
      ul.appendChild(li2);
    });
  }

  function renderCC(arr) {
    var ul = $("cc-list");
    clear(ul);
    if (!arr || arr.length === 0) {
      var li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nessun comando: creane uno qui sotto (max 20).";
      ul.appendChild(li);
      return;
    }
    arr.forEach(function (c) {
      var li2 = document.createElement("li");
      li2.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = "!" + c.name + " → " + String(c.response || "").slice(0, 80);
      li2.appendChild(txt);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-secondary btn-sm";
      del.textContent = "Elimina";
      del.setAttribute("aria-label", "Elimina comando !" + c.name);
      del.addEventListener("click", function () {
        openConfirm("Eliminare il comando !" + c.name + "?").then(function (ok) {
          if (!ok) return;
          setSaving(del, true);
          var modCC = "commands";
          putModule(modCC, { action: "remove", name: c.name })
            .then(function (r) {
              state.listsCache.customCommands = (r && r.list) || [];
              renderCC(state.listsCache.customCommands);
              toast("Comando eliminato.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { setSaving(del, false); });
        });
      });
      li2.appendChild(del);
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
      li.textContent = "Nessuna ricompensa: abbina un ruolo a un livello qui sotto.";
      ul.appendChild(li);
      return;
    }
    arr.forEach(function (r) {
      var li2 = document.createElement("li");
      li2.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = "Livello " + r.level + " → @" + roleName(r.roleId);
      li2.appendChild(txt);
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-secondary btn-sm";
      del.textContent = "Elimina";
      del.setAttribute("aria-label", "Elimina ricompensa livello " + r.level);
      del.addEventListener("click", function () {
        openConfirm("Eliminare la ricompensa per il livello " + r.level + "?").then(function (ok) {
          if (!ok) return;
          setSaving(del, true);
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
            .then(function () { setSaving(del, false); });
        });
      });
      li2.appendChild(del);
      ul.appendChild(li2);
    });
  }

  function buildRewardRoles(roles) {
    var sel = $("rw-role");
    clear(sel);
    var usable = (roles || []).filter(function (r) { return !r.managed; });
    if (usable.length === 0) {
      var o = document.createElement("option");
      o.value = "";
      o.textContent = "Nessun ruolo disponibile";
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
      openConfirm("Aggiungere la risposta per «" + match + "»?").then(function (ok) {
        if (!ok) return;
        setSaving(btn, true);
        var modAdd = "autoresponder";
        putModule(modAdd, { action: "add", match: match, response: response })
          .then(function (r) {
            state.listsCache.autoresponder = (r && r.list) || state.listsCache.autoresponder;
            renderAR(state.listsCache.autoresponder);
            $("ar-match").value = "";
            $("ar-response").value = "";
            toast("Risposta aggiunta.", "ok");
          })
          .catch(function (err) {
            if (err && err.message === "unauthorized") return;
            toast("Errore: " + err.message, "err");
          })
          .then(function () { setSaving(btn, false); });
      });
    });
    $("cc-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var name = $("cc-name").value.trim().toLowerCase();
      var response = $("cc-response").value.trim();
      if (!/^[a-z0-9-]{2,20}$/.test(name)) { toast("Nome non valido: 2-20 caratteri a-z 0-9 -.", "err"); return; }
      if (!response) { toast("La risposta è obbligatoria.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      openConfirm("Salvare il comando !" + name + "?").then(function (ok) {
        if (!ok) return;
        setSaving(btn, true);
        var modCreate = "commands";
        putModule(modCreate, { action: "create", name: name, response: response })
          .then(function (r) {
            state.listsCache.customCommands = (r && r.list) || state.listsCache.customCommands;
            renderCC(state.listsCache.customCommands);
            $("cc-name").value = "";
            $("cc-response").value = "";
            toast("Comando !" + name + " salvato.", "ok");
          })
          .catch(function (err) {
            if (err && err.message === "unauthorized") return;
            toast("Errore: " + err.message, "err");
          })
          .then(function () { setSaving(btn, false); });
      });
    });
    $("rw-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var level = Math.floor(Number($("rw-level").value));
      var roleId = $("rw-role").value;
      if (!Number.isFinite(level) || level < 1 || level > 100) { toast("Livello non valido (1-100).", "err"); return; }
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      openConfirm("Assegnare @" + roleName(roleId) + " al livello " + level + "?").then(function (ok) {
        if (!ok) return;
        setSaving(btn, true);
        var modSet = "rewards";
        putModule(modSet, { action: "set", level: level, roleId: roleId })
          .then(function (r) {
            state.listsCache.levelRewards = (r && r.list) || state.listsCache.levelRewards;
            renderRW(state.listsCache.levelRewards);
            toast("Ricompensa salvata.", "ok");
          })
          .catch(function (err) {
            if (err && err.message === "unauthorized") return;
            toast("Errore: " + err.message, "err");
          })
          .then(function () { setSaving(btn, false); });
      });
    });
  }

  /* ---------- Permessi custom ---------- */
  function buildPermCommandSelect(detail) {
    var sel = $("perm-command");
    clear(sel);
    var cmds = PERM_COMMANDS.slice();
    var custom = (state.listsCache.customCommands || []).map(function (c) { return "!" + c.name; });
    custom.forEach(function (c) { if (cmds.indexOf(c) === -1) cmds.push(c); });
    void detail;
    cmds.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
  }

  function buildPermRoles(roles) {
    var box = $("perm-roles");
    clear(box);
    var usable = (roles || []).filter(function (r) { return !r.managed; });
    if (usable.length === 0) {
      box.textContent = "Nessun ruolo disponibile.";
      return;
    }
    usable.forEach(function (r) {
      var label = document.createElement("label");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.name = "roleIds";
      cb.value = r.id || r.value || "";
      var span = document.createElement("span");
      span.textContent = r.name || r.label || cb.value;
      label.appendChild(cb);
      label.appendChild(span);
      box.appendChild(label);
    });
  }

  function renderPerms(perms) {
    var ul = $("perms-list");
    clear(ul);
    if (!perms) {
      var li0 = document.createElement("li");
      li0.textContent = "Nessun dato.";
      ul.appendChild(li0);
      return;
    }
    if (Array.isArray(perms)) {
      if (perms.length === 0) {
        var li1 = document.createElement("li");
        li1.textContent = "Nessun permesso custom.";
        ul.appendChild(li1);
        return;
      }
      perms.forEach(function (p) {
        var li = document.createElement("li");
        var cmd = p.command || p.name || "?";
        var roles = Array.isArray(p.roleIds) ? p.roleIds.map(roleName).join(", ") : (p.roles || "");
        li.textContent = cmd + (roles ? " → " + roles : "");
        ul.appendChild(li);
      });
      return;
    }
    var keys = Object.keys(perms);
    if (keys.length === 0) {
      var li2 = document.createElement("li");
      li2.textContent = "Nessun permesso custom.";
      ul.appendChild(li2);
      return;
    }
    keys.forEach(function (cmd) {
      var li3 = document.createElement("li");
      var val = perms[cmd];
      var names = Array.isArray(val) ? val.map(roleName).join(", ") : String(val);
      li3.textContent = cmd + " → " + names;
      ul.appendChild(li3);
    });
  }

  function initPermsForm() {
    $("perms-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) {
        toast("Seleziona prima un server.", "err");
        return;
      }
      var command = $("perm-command").value;
      if (!command) {
        toast("Seleziona un comando.", "err");
        $("perm-command").focus();
        return;
      }
      var checked = Array.prototype.slice.call(
        document.querySelectorAll('#perm-roles input[name="roleIds"]:checked')
      ).map(function (cb) { return cb.value; });
      openConfirm("Salvare i permessi per " + command + (checked.length === 0 ? " (reset)?" : "?")).then(function (ok) {
        if (!ok) return;
        var btn = $("perm-save");
        setSaving(btn, true);
        putJSON("/api/guilds/" + encodeURIComponent(state.gid) + "/perms", {
          command: command,
          roleIds: checked
        }).then(function () {
          toast("Permessi salvati per " + command + ".", "ok");
          return getJSON("/api/guilds/" + encodeURIComponent(state.gid));
        }).then(function (detail) {
          renderPerms(detail && detail.perms);
        }).catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore salvataggio permessi: " + err.message, "err");
        }).then(function () { setSaving(btn, false); });
      });
    });
  }

  /* ---------- Filtri sidebar ---------- */
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
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildPermCommandSelect();
    initPermsForm();
    initListForms();
    initConfirm();
    initNav();
    initFilters();
    initShortcut();
    buildTabs();
    showDetail(false);
    setStatus("Connessione…");
    showGuildSkeletons();
    showPanelSkeletons();
    window.addEventListener("resize", updateTabIndicator);
    window.addEventListener("hashchange", function () {
      var deep = readHashGid();
      if (deep && deep !== state.gid) {
        var found = state.guilds.filter(function (g) { return g && g.id === deep && g.botPresent; })[0];
        if (found) selectGuild(found.id, found.name);
      }
    });
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
