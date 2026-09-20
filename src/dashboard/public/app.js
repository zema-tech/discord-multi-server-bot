/* Dashboard app — Vanilla JS, niente framework.
   Usa solo il contratto API del backend:
   GET me, GET guilds, GET guild detail, GET schema, GET meta,
   PUT modules, PUT perms.
   UX: card server con ricerca e filtri, tab per-server (panoramica,
   moduli, liste, permessi), skeleton, empty-state, modale di conferma,
   toast, validazione client-side speculare al backend, drawer mobile.
   XSS-safe: solo textContent e createElement, mai innerHTML con dati server. */
(function () {
  "use strict";

  var PERM_COMMANDS = [
    "ban", "kick", "timeout", "warn", "clear", "slowmode",
    "lock", "nuke", "giveaway", "poll", "ticket",
    "setup", "embed", "evento", "template"
  ];

  var TABS = [
    { id: "panoramica", label: "📊 Panoramica" },
    { id: "moduli", label: "🧩 Moduli" },
    { id: "liste", label: "📝 Liste" },
    { id: "permessi", label: "🔐 Permessi" }
  ];

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

  function $(id) { return document.getElementById(id); }

  function setStatus(msg) {
    $("status").textContent = msg || "";
  }

  function toast(msg, kind) {
    var wrap = $("toasts");
    var el = document.createElement("div");
    el.className = "toast" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    el.setAttribute("role", kind === "err" ? "alert" : "status");
    el.textContent = msg;
    wrap.appendChild(el);
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4000);
  }

  function checkAuth(res) {
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("unauthorized");
    }
    return res;
  }

  function errorBody(res, fallback) {
    return res.text().then(function (t) {
      try {
        var j = JSON.parse(t);
        if (j && typeof j === "object") {
          var m = j.errore || j.error || j.message;
          if (m) return String(m) + " (HTTP " + res.status + ")";
        }
      } catch (e) { /* corpo non JSON: uso il fallback */ }
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
        return res.json();
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
        return res.json().catch(function () { return {}; });
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

  function openConfirm(message) {
    return new Promise(function (resolve) {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      $("confirm-msg").textContent = message;
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
    var login = document.createElement("a");
    login.className = "btn btn-primary btn-sm";
    login.href = "/login";
    login.textContent = "Accedi di nuovo";
    box.appendChild(strong);
    box.appendChild(hint);
    box.appendChild(login);
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
      var s0 = document.createElement("strong");
      s0.textContent = "Nessun server per questo filtro";
      var p0 = document.createElement("p");
      p0.textContent = "Prova a cambiare filtro o ricerca.";
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
        return; // server non gestibile: non mostrare
      }
      list.appendChild(li);
    });
  }

  function loadGuilds() {
    return getJSON("/api/guilds").then(function (guilds) {
      state.guilds = Array.isArray(guilds) ? guilds : [];
      renderGuildList();
      renderOverview();
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
  function renderOverview() {
    var withBot = state.guilds.filter(function (g) { return g.botPresent; });
    var missing = state.guilds.filter(function (g) { return g.canManage && !g.botPresent; });
    var members = withBot.reduce(function (acc, g) {
      return acc + (typeof g.memberCount === "number" ? g.memberCount : 0);
    }, 0);
    var box = $("overview-stats");
    clear(box);
    [
      { k: "Server con bot", v: String(withBot.length) },
      { k: "Membri totali", v: fmtNum(members) },
      { k: "Da aggiungere", v: String(missing.length) }
    ].forEach(function (s) {
      var card = document.createElement("div");
      card.className = "stat-card";
      var kk = document.createElement("div");
      kk.className = "k";
      kk.textContent = s.k;
      var vv = document.createElement("div");
      vv.className = "v";
      vv.textContent = s.v;
      card.appendChild(kk);
      card.appendChild(vv);
      box.appendChild(card);
    });
    var grid = $("overview-grid");
    clear(grid);
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
    clear(nav);
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (state.activeTab === t.id ? " is-active" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", state.activeTab === t.id ? "true" : "false");
      b.dataset.tab = t.id;
      b.textContent = t.label;
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
    $("guild-hero").hidden = !show;
    $("guild-hero-empty").hidden = show;
  }

  /* ---------- Selezione server ---------- */
  function selectGuild(gid, fallbackName) {
    state.gid = gid;
    state.activeTab = "panoramica";
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
  function statCard(k, v) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var kk = document.createElement("div");
    kk.className = "k";
    kk.textContent = k;
    var vv = document.createElement("div");
    vv.className = "v small-v";
    vv.textContent = v;
    card.appendChild(kk);
    card.appendChild(vv);
    return card;
  }

  function renderDetail(detail) {
    var stats = (detail && detail.stats) || {};
    var counts = (detail && detail.counts) || {};
    var box = $("stats");
    clear(box);
    box.appendChild(statCard("Membri", fmtNum(counts.members)));
    box.appendChild(statCard("Canali", fmtNum(counts.channels)));
    box.appendChild(statCard("Ruoli", fmtNum(counts.roles)));
    var analytics = stats.analytics || {};
    box.appendChild(statCard("Messaggi (7g)", fmtNum(analytics.messages)));
    var openT = (stats.openTickets !== undefined && stats.openTickets !== null)
      ? stats.openTickets : "-";
    box.appendChild(statCard("Ticket aperti", String(openT)));
    var mods = state.modulesCache || {};
    var onCount = ["general", "welcome", "automod", "autorole", "starboard", "confessioni", "levels", "tickets", "tempvoice", "ai"]
      .filter(function () { return false; }).length;
    void onCount;
    box.appendChild(statCard("Trigger auto", String((state.listsCache.autoresponder || []).length)));
    box.appendChild(statCard("Comandi !", String((state.listsCache.customCommands || []).length)));
    void mods;
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
      if (m.custom) return false; // liste dedicate nel tab Liste
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
      card.className = "card";
      card.dataset.module = mod.module;
      card.dataset.section = sectionOf(mod);

      var head = document.createElement("div");
      head.className = "mod-head";
      var h = document.createElement("h3");
      h.textContent = (mod.icon ? mod.icon + " " : "") + (mod.title || mod.module);
      head.appendChild(h);
      var sec = document.createElement("span");
      sec.className = "badge";
      sec.textContent = sectionOf(mod);
      head.appendChild(sec);
      card.appendChild(head);
      if (mod.description) {
        var d = document.createElement("p");
        d.className = "muted small";
        d.textContent = mod.description;
        card.appendChild(d);
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
        card.appendChild(wrap);
      });

      var save = document.createElement("button");
      save.type = "submit";
      save.className = "btn btn-primary btn-sm";
      save.textContent = "Salva " + (mod.title || mod.module);
      card.appendChild(save);

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
      putJSON("/api/guilds/" + encodeURIComponent(state.gid) + "/modules/" + encodeURIComponent(modName), body)
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

  /* ---------- Liste (autoresponder / comandi / ricompense) ---------- */
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
            });
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
            });
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
            });
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
    $("ar-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var match = $("ar-match").value.trim();
      var response = $("ar-response").value.trim();
      if (!match || !response) { toast("Parola e risposta sono obbligatorie.", "err"); return; }
      openConfirm("Aggiungere la risposta per «" + match + "»?").then(function (ok) {
        if (!ok) return;
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
          });
      });
    });
    $("cc-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var name = $("cc-name").value.trim().toLowerCase();
      var response = $("cc-response").value.trim();
      if (!/^[a-z0-9-]{2,20}$/.test(name)) { toast("Nome non valido: 2-20 caratteri a-z 0-9 -.", "err"); return; }
      if (!response) { toast("La risposta è obbligatoria.", "err"); return; }
      openConfirm("Salvare il comando !" + name + "?").then(function (ok) {
        if (!ok) return;
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
          });
      });
    });
    $("rw-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!state.gid) { toast("Seleziona prima un server.", "err"); return; }
      var level = Math.floor(Number($("rw-level").value));
      var roleId = $("rw-role").value;
      if (!Number.isFinite(level) || level < 1 || level > 100) { toast("Livello non valido (1-100).", "err"); return; }
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      openConfirm("Assegnare @" + roleName(roleId) + " al livello " + level + "?").then(function (ok) {
        if (!ok) return;
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
          });
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
