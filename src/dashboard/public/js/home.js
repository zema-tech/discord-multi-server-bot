/* home.js — vista home della dashboard: lista server, filtri e panoramica globale.
   Usa SOLO window.Dash definito da js/core.js (stato, helper DOM/rete, selectGuild).
   Contratto API: solo GET /api/guilds. Testi in italiano, XSS-safe (solo textContent). */
(function () {
  "use strict";

  var Dash = window.Dash;
  if (!Dash || !Dash.state) return;

  var SKELETON_ROWS = 4;
  var RANK_LIMIT = 8;
  var MISSING_LIMIT = 5;
  var filtersWired = false;

  function readHashGid() {
    if (typeof Dash.readHashGid === "function") {
      try {
        return Dash.readHashGid();
      } catch (e) {
        return null;
      }
    }
    try {
      var h = String(window.location.hash || "");
      var m = h.match(/gid=([A-Za-z0-9]+)/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  /* Icona server locale: span.guild-icon con img oppure iniziali. */
  function guildIconEl(g) {
    var icon = document.createElement("span");
    icon.className = "guild-icon";
    var src = g && g.icon ? g.icon : null;
    if (src) {
      var img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.loading = "lazy";
      icon.appendChild(img);
    } else {
      icon.textContent = Dash.initials(g ? g.name : null);
    }
    return icon;
  }

  function filteredGuilds() {
    var q = String(Dash.state.search || "").trim().toLowerCase();
    return Dash.state.guilds.filter(function (g) {
      if (!g) return false;
      if (Dash.state.filter === "bot" && !g.botPresent) return false;
      if (Dash.state.filter === "missing" && (g.botPresent || !g.canManage)) return false;
      if (q && String(g.name || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function stNum(g, k) {
    return g && g.stats && typeof g.stats[k] === "number" ? g.stats[k] : 0;
  }

  function showGuildSkeletons() {
    var list = Dash.$("guild-list");
    if (!list) return;
    Dash.clear(list);
    list.setAttribute("aria-busy", "true");
    for (var i = 0; i < SKELETON_ROWS; i++) {
      var li = document.createElement("li");
      li.className = "skeleton-row";
      li.setAttribute("aria-hidden", "true");
      var av = document.createElement("span");
      av.className = "skeleton sk-avatar";
      var lines = document.createElement("span");
      lines.className = "sk-lines";
      lines.appendChild(Dash.skeletonLine("70%"));
      lines.appendChild(Dash.skeletonLine("45%"));
      li.appendChild(av);
      li.appendChild(lines);
      list.appendChild(li);
    }
  }

  function renderGuildList() {
    var list = Dash.$("guild-list");
    if (!list) return;
    Dash.clear(list);
    list.setAttribute("aria-busy", "false");
    var withBot = Dash.state.guilds.filter(function (g) { return g && g.botPresent; });
    var manageable = Dash.state.guilds.filter(function (g) { return g && g.canManage; });
    var count = Dash.$("guild-count");
    if (count) count.textContent = withBot.length + "/" + manageable.length;
    var items = filteredGuilds();
    if (Dash.state.guilds.length === 0 || items.length === 0) {
      var li = document.createElement("li");
      li.style.listStyle = "none";
      if (Dash.state.guilds.length === 0) {
        li.appendChild(Dash.emptyBox("server", "Nessun server",
          "Aggiungi il bot a un server dove hai il permesso Gestisci Server, poi accedi di nuovo.",
          [{ label: "Accedi di nuovo", href: "/login", primary: true }]));
      } else {
        li.appendChild(Dash.emptyBox("search", "Nessun risultato", "Prova a cambiare filtro o ricerca.", null));
      }
      list.appendChild(li);
      return;
    }
    items.forEach(function (g) {
      if (!g.botPresent && !g.canManage) return;
      var li2 = document.createElement("li");
      var row = document.createElement("div");
      row.className = "guild-row" + (g.id === Dash.state.gid ? " is-active" : "");
      if (g.botPresent) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "guild-btn";
        btn.setAttribute("aria-current", g.id === Dash.state.gid ? "true" : "false");
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
        sub.textContent = typeof g.memberCount === "number"
          ? Dash.fmtNum(g.memberCount) + " membri"
          : "Apri pannello";
        txt.appendChild(sub);
        btn.appendChild(txt);
        var pill = document.createElement("span");
        pill.className = "pill pill-live";
        pill.textContent = typeof g.memberCount === "number" ? Dash.fmtCompact(g.memberCount) : "Bot";
        btn.appendChild(pill);
        btn.addEventListener("click", function () { Dash.selectGuild(g.id, g.name); });
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
        sub2.textContent = "Bot non presente";
        txt2.appendChild(sub2);
        row.appendChild(txt2);
        if (g.inviteUrl) {
          var add = document.createElement("a");
          add.className = "btn btn-primary btn-sm";
          add.href = g.inviteUrl;
          add.target = "_blank";
          add.rel = "noopener";
          add.textContent = "Aggiungi bot";
          add.setAttribute("aria-label", "Aggiungi il bot a " + (g.name || g.id));
          row.appendChild(add);
        } else {
          var pill2 = document.createElement("span");
          pill2.className = "pill";
          pill2.textContent = "Non collegato";
          row.appendChild(pill2);
        }
      }
      li2.appendChild(row);
      list.appendChild(li2);
    });
  }

  function overviewStat(iconName, label, raw, sub) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var top = document.createElement("div");
    top.className = "stat-top";
    top.appendChild(Dash.iconEl(iconName));
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
      Dash.animateValue(vv, raw);
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
    top.appendChild(Dash.iconEl("server"));
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
    ss.textContent = typeof Dash.state.apiMs === "number"
      ? "Risposta in " + Dash.state.apiMs + " ms"
      : "Pannello collegato";
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
    var withBot = Dash.state.guilds.filter(function (g) { return g && g.botPresent; });
    var missing = Dash.state.guilds.filter(function (g) { return g && g.canManage && !g.botPresent; });
    var members = withBot.reduce(function (acc, g) {
      return acc + (typeof g.memberCount === "number" ? g.memberCount : 0);
    }, 0);
    var msg7 = withBot.reduce(function (a, g) { return a + stNum(g, "messages7"); }, 0);
    var openT = withBot.reduce(function (a, g) { return a + stNum(g, "openTickets"); }, 0);
    var box = Dash.$("overview-stats");
    if (box) {
      Dash.clear(box);
      box.appendChild(overviewStat("server", "Server gestiti", withBot.length, null));
      box.appendChild(overviewStat("users", "Membri totali", members, null));
      box.appendChild(overviewStat("message", "Messaggi (7g)", msg7,
        withBot.length + (withBot.length === 1 ? " server" : " server")));
      box.appendChild(overviewStat("ticket", "Ticket aperti", openT, null));
      box.appendChild(statusCard());
    }
    var grid = Dash.$("overview-grid");
    if (!grid) return;
    Dash.clear(grid);
    if (withBot.length === 0 && missing.length === 0) {
      grid.appendChild(Dash.emptyBox("server", "Nessun server",
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
      ordered.slice(0, RANK_LIMIT).forEach(function (g) {
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
        if (typeof g.memberCount === "number") bits.push(Dash.fmtNum(g.memberCount) + " membri");
        bits.push(Dash.fmtNum(stNum(g, "messages7")) + " messaggi");
        if (stNum(g, "openTickets") > 0) bits.push(Dash.fmtNum(stNum(g, "openTickets")) + " ticket aperti");
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
          lb.textContent = g.setup.done === g.setup.total
            ? "Configurato"
            : "Configurazione " + g.setup.done + "/" + g.setup.total;
          setupWrap.appendChild(lb);
          tx.appendChild(setupWrap);
        }
        row.appendChild(tx);
        row.appendChild(sparkEl(g.stats && g.stats.spark, maxMsg));
        var go = document.createElement("button");
        go.type = "button";
        go.className = "btn btn-secondary btn-sm";
        var incomplete = !!(g.setup && typeof g.setup.done === "number" &&
          typeof g.setup.total === "number" && g.setup.total > 0 && g.setup.done < g.setup.total);
        var verb = incomplete ? "Completa" : "Gestisci";
        go.textContent = verb;
        go.setAttribute("aria-label", verb + " " + (g.name || g.id));
        go.addEventListener("click", function () { Dash.selectGuild(g.id, g.name); });
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
      mhp.textContent = "Aggiungi il bot per sbloccare la gestione.";
      miss.appendChild(mhp);
      missing.slice(0, MISSING_LIMIT).forEach(function (g) {
        var row2 = document.createElement("div");
        row2.className = "ov-miss";
        var nm2 = document.createElement("span");
        nm2.textContent = g.name || g.id;
        row2.appendChild(nm2);
        if (g.inviteUrl) {
          var a = document.createElement("a");
          a.className = "btn btn-primary btn-sm";
          a.href = g.inviteUrl;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = "Aggiungi bot";
          a.setAttribute("aria-label", "Aggiungi il bot a " + (g.name || g.id));
          row2.appendChild(a);
        }
        miss.appendChild(row2);
      });
      grid.appendChild(miss);
    }
  }

  function loadGuilds() {
    var t0 = 0;
    try {
      t0 = performance.now();
    } catch (e) {
      t0 = 0;
    }
    return Dash.getJSON("/api/guilds").then(function (guilds) {
      try {
        Dash.state.apiMs = t0 ? Math.round(performance.now() - t0) : null;
      } catch (e) {
        Dash.state.apiMs = null;
      }
      Dash.state.guilds = Array.isArray(guilds) ? guilds : [];
      renderGuildList();
      renderOverview();
      if (typeof Dash.refreshStatus === "function") {
        try {
          Dash.refreshStatus();
        } catch (e) {
          /* stato non critico */
        }
      }
      var deep = readHashGid();
      if (deep) {
        var found = null;
        for (var i = 0; i < Dash.state.guilds.length; i++) {
          var g = Dash.state.guilds[i];
          if (g && g.id === deep && g.botPresent) {
            found = g;
            break;
          }
        }
        if (found && typeof Dash.selectGuild === "function") Dash.selectGuild(found.id, found.name);
      }
    });
  }

  /* Solo wiring dei filtri home (il boot dati resta nel core). Idempotente. */
  function initHomeFilters() {
    if (filtersWired) return;
    filtersWired = true;
    var chips = document.querySelectorAll("#sidebar .chips .chip[data-filter]");
    if (!chips || chips.length === 0) chips = document.querySelectorAll(".chips .chip[data-filter]");
    function syncChips() {
      Array.prototype.forEach.call(chips, function (c) {
        var on = c.dataset.filter === Dash.state.filter;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    Array.prototype.forEach.call(chips, function (chip) {
      if (chip.dataset.homeWired === "1") return;
      chip.dataset.homeWired = "1";
      chip.addEventListener("click", function () {
        Dash.state.filter = chip.dataset.filter;
        syncChips();
        renderGuildList();
      });
    });
    syncChips();
    var search = Dash.$("guild-search");
    if (search && search.dataset.homeWired !== "1") {
      search.dataset.homeWired = "1";
      search.addEventListener("input", function (ev) {
        Dash.state.search = (ev.target && ev.target.value) || "";
        renderGuildList();
      });
    }
  }

  Dash.loadGuilds = loadGuilds;
  Dash.showGuildSkeletons = showGuildSkeletons;
  Dash.renderGuildList = renderGuildList;
  Dash.renderOverview = renderOverview;
  Dash.initHomeFilters = initHomeFilters;

  /* Quando si torna alla home, svuota il breadcrumb. Guard se assente. */
  (function wrapShowViewsForCrumbs() {
    try {
      if (typeof Dash.showViews !== "function") return;
      if (Dash.showViews.__crumbsWrapped) return;
      var orig = Dash.showViews;
      var wrapped = function (server) {
        try { orig(server); } catch (e) { /* vista non critica */ }
        try {
          if (!server) {
            var cl = document.getElementById("crumb-list");
            if (cl) {
              while (cl.firstChild) cl.removeChild(cl.firstChild);
            }
          }
        } catch (e) { /* breadcrumb non critico */ }
      };
      wrapped.__crumbsWrapped = true;
      Dash.showViews = wrapped;
    } catch (e) { /* ignora */ }
  })();

  /* Il core fa il boot dati; qui solo wire dei filtri (listener multipli consentiti). */
  function bootFilters() {
    try {
      Dash.initHomeFilters();
    } catch (e) {
      /* filtri non critici */
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFilters);
  } else {
    bootFilters();
  }
})();
