/* Dashboard app — Vanilla JS, niente framework.
    Consuma ESATTAMENTE il contratto API del backend:
    GET /api/me | GET /api/guilds | GET /api/guilds/:gid
    GET /api/guilds/:gid/schema | GET /api/guilds/:gid/meta
    PUT /api/guilds/:gid/modules/:mod | PUT /api/guilds/:gid/perms
    Dettagli UX: skeleton durante i fetch, empty-state se nessun server
    gestibile, modale di conferma custom prima di ogni PUT, toast con
    ruolo status/alert, validazione client-side speculare al backend
    (range numerici, maxlength testi, select canale obbligatorie con
    opzione "Nessuno" -> null), drawer mobile, zero log spuri.
    XSS-safe: solo textContent / createElement, mai innerHTML con dati server. */
(function () {
  "use strict";

  // Lista fissa dei comandi per la select permessi.
  var PERM_COMMANDS = [
    "ban", "kick", "timeout", "warn", "clear", "slowmode",
    "lock", "nuke", "giveaway", "poll", "ticket",
    "setup", "embed", "evento", "template"
  ];

  var state = {
    gid: null,
    meta: { channels: [], roles: [] },
    modulesCache: {},
    schema: []
  };

  // Mirror dei vincoli backend (api.js): NUMBER_RANGES, TEXT_LIMITS.
  // Se il backend cambia, la validazione server resta autoritativa
  // e i suoi messaggi vengono mostrati nel toast.
  var NUMBER_RANGES = { maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90] };
  var TEXT_LIMITS = { welcomeMessage: 500, systemPrompt: 1000 };
  var DEFAULT_TEXT_MAX = 1000;
  var NONE_VALUE = "__none__"; // select canale/ruolo: "Nessuno" -> null
  var SKELETON_COUNT = 4;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg) {
    $("status").textContent = msg || "";
  }

  function toast(msg, kind) {
    var wrap = $("toasts");
    var el = document.createElement("div");
    el.className = "toast" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    // Ruolo per screen reader: il wrap ha già aria-live="polite".
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

  // Estrae il messaggio d'errore dal backend ({ errore } / { error } / { message }),
  // con fallback allo status HTTP. Mai HTML, solo testo.
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

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function initials(name) {
    if (!name) return "?";
    var parts = String(name).trim().split(/\s+/);
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[1].charAt(0) : "")).toUpperCase();
  }

  /* ---------- Skeleton di caricamento ---------- */
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
      var g3 = document.createElement("div");
      g3.style.height = "0.6rem";
      m.appendChild(g3);
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

  /* ---------- Modale di conferma custom ---------- */
  var confirmResolve = null;

  function openConfirm(message) {
    return new Promise(function (resolve) {
      if (confirmResolve) confirmResolve(false); // chiude un'eventuale conferma pendente
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

  /* ---------- /api/me ---------- */
  function loadMe() {
    return getJSON("/api/me").then(function (me) {
      var name = me.username || me.tag || me.name || "Utente";
      $("user-name").textContent = name;
      $("user-sub").textContent = me.id ? "ID " + me.id : "connesso";
      $("user-avatar").textContent = initials(name);
    }).catch(function (err) {
      if (err && err.message === "unauthorized") return;
      $("user-name").textContent = "Non connesso";
      $("user-sub").textContent = "vai a /login";
      throw err;
    });
  }

  /* ---------- /api/guilds ---------- */
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
    // Rimuove il bullet di lista per l'empty-state
    li.style.listStyle = "none";
    list.appendChild(li);
  }

  function loadGuilds() {
    return getJSON("/api/guilds").then(function (guilds) {
      var list = $("guild-list");
      clear(list);
      var items = Array.isArray(guilds) ? guilds.filter(function (g) { return g && g.botPresent; }) : [];
      if (items.length === 0) {
        emptyGuilds(list, guilds);
        return;
      }
      list.setAttribute("aria-busy", "false");
      items.forEach(function (g) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "guild-btn";
        btn.setAttribute("aria-current", g.id === state.gid ? "true" : "false");
        btn.dataset.gid = g.id;

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

        var label = document.createElement("span");
        label.textContent = g.name || g.id;

        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener("click", function () { selectGuild(g.id, g.name); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    });
  }

  function markActiveGuild() {
    var btns = document.querySelectorAll(".guild-btn");
    btns.forEach(function (b) {
      b.setAttribute("aria-current", b.dataset.gid === state.gid ? "true" : "false");
    });
  }

  /* ---------- Selezione server ---------- */
  function selectGuild(gid, fallbackName) {
    state.gid = gid;
    markActiveGuild();
    if (isMobileNav()) closeNav();
    setStatus("Caricamento dati server…");
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
      state.schema = Array.isArray(schema) ? schema : [];
      renderDetail(detail, fallbackName);
      renderSchema(state.schema, state.modulesCache);
      renderPerms(detail && detail.perms);
      buildPermCommandSelect();
      buildPermRoles(state.meta.roles);
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

  /* ---------- Cards statistiche ---------- */
  function renderDetail(detail, fallbackName) {
    var guild = (detail && detail.guild) || {};
    $("guild-title").textContent = guild.name || fallbackName || "Server";
    $("guild-sub").textContent = guild.id ? "ID " + guild.id : "";
    var stats = (detail && detail.stats) || {};
    var box = $("stats");
    clear(box);
    var keys = Object.keys(stats);
    if (keys.length === 0) {
      var empty = document.createElement("div");
      empty.className = "stat-card";
      var k = document.createElement("div");
      k.className = "k";
      k.textContent = "Statistiche";
      var v = document.createElement("div");
      v.className = "v";
      v.textContent = "—";
      empty.appendChild(k);
      empty.appendChild(v);
      box.appendChild(empty);
      return;
    }
    keys.forEach(function (key) {
      var card = document.createElement("div");
      card.className = "stat-card";
      var kk = document.createElement("div");
      kk.className = "k";
      kk.textContent = key;
      var vv = document.createElement("div");
      vv.className = "v";
      vv.textContent = String(stats[key]);
      card.appendChild(kk);
      card.appendChild(vv);
      box.appendChild(card);
    });
  }

  /* ---------- Editor moduli SCHEMA-DRIVEN ---------- */
  function longTextField(key) {
    return /message|description|text|embed|motivo|reason/i.test(key || "");
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
    } else if (type === "channel" || type === "role") {
      input = document.createElement("select");
      input.required = true;
      var opts = type === "channel" ? state.meta.channels : state.meta.roles;
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "— seleziona —";
      input.appendChild(none);
      var noSet = document.createElement("option");
      noSet.value = NONE_VALUE;
      noSet.textContent = "Nessuno (disattiva)";
      input.appendChild(noSet);
      (opts || []).forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.id || o.value || "";
        opt.textContent = o.name || o.label || opt.value;
        if (current !== undefined && current !== null && String(current) === String(opt.value) && opt.value !== "") opt.selected = true;
        input.appendChild(opt);
      });
      if (current === null || current === undefined) input.value = NONE_VALUE;
    } else {
      // type "text" (o sconosciuto -> fallback text)
      var limit = TEXT_LIMITS[field.key] || DEFAULT_TEXT_MAX;
      if (longTextField(field.key)) {
        input = document.createElement("textarea");
        input.value = current !== undefined && current !== null ? String(current) : "";
        input.maxLength = limit;
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = current !== undefined && current !== null ? String(current) : "";
        input.maxLength = limit;
      }
    }
    input.id = "f-" + modName + "-" + field.key;
    input.name = field.key;
    input.dataset.fkey = field.key;
    input.dataset.ftype = type;
    return input;
  }

  function renderSchema(schema, modulesCache) {
    var box = $("modules");
    clear(box);
    if (schema.length === 0) {
      var p = document.createElement("p");
      p.className = "status-line";
      p.textContent = "Nessun modulo configurabile per questo server.";
      box.appendChild(p);
      return;
    }
    schema.forEach(function (mod) {
      var card = document.createElement("form");
      card.className = "card";
      card.dataset.module = mod.module;

      var h = document.createElement("h3");
      h.textContent = mod.title || mod.module;
      card.appendChild(h);

      var values = (modulesCache && modulesCache[mod.module]) || {};
      (mod.fields || []).forEach(function (field) {
        var wrap = document.createElement("div");
        wrap.className = "field" + (field.type === "bool" ? " toggle" : "");
        var label = document.createElement("label");
        label.textContent = field.label || field.key;
        var ctl = fieldControl(mod.module, field, values[field.key]);
        label.htmlFor = ctl.id;
        if (field.type === "bool") {
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
    if (t === "bool") return ctl.checked;
    if (t === "number") {
      if (ctl.value === "") return null;
      var n = Number(ctl.value);
      if (isNaN(n) || !isFinite(n)) return ctl.value;
      return Math.floor(n);
    }
    if (t === "channel" || t === "role") {
      if (ctl.value === NONE_VALUE) return null;
      return ctl.value;
    }
    return ctl.value;
  }

  function setFieldError(ctl, msg) {
    ctl.setAttribute("aria-invalid", "true");
    var id = ctl.id + "-err";
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
    var id = ctl.id + "-err";
    var p = document.getElementById(id);
    if (p && p.parentNode) p.parentNode.removeChild(p);
    var described = ctl.getAttribute("aria-describedby") || "";
    described = described.split(" ").filter(function (x) { return x && x !== id; }).join(" ");
    if (described) ctl.setAttribute("aria-describedby", described);
    else ctl.removeAttribute("aria-describedby");
  }

  // Validazione client-side speculare al backend. Ritorna { ctl, msg } al primo errore, altrimenti null.
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
      }
    }
    return null;
  }

  function setSaving(btn, saving, baseLabel) {
    btn.disabled = saving;
    if (saving) {
      btn.dataset.label = btn.textContent;
      btn.textContent = "Salvataggio…";
    } else {
      btn.textContent = btn.dataset.label || baseLabel || btn.textContent;
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

  /* ---------- Permessi custom ---------- */
  function buildPermCommandSelect() {
    var sel = $("perm-command");
    clear(sel);
    PERM_COMMANDS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
  }

  function buildPermRoles(roles) {
    var box = $("perm-roles");
    clear(box);
    if (!roles || roles.length === 0) {
      box.textContent = "Nessun ruolo disponibile.";
      return;
    }
    roles.forEach(function (r) {
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
        var roles = Array.isArray(p.roleIds) ? p.roleIds.join(", ") : (p.roles || "");
        li.textContent = cmd + (roles ? " → " + roles : "");
        ul.appendChild(li);
      });
      return;
    }
    Object.keys(perms).forEach(function (cmd) {
      var li = document.createElement("li");
      var val = perms[cmd];
      li.textContent = cmd + " → " + (Array.isArray(val) ? val.join(", ") : String(val));
      ul.appendChild(li);
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
      openConfirm("Salvare i permessi per /" + command + "?").then(function (ok) {
        if (!ok) return;
        var btn = $("perm-save");
        setSaving(btn, true);
        putJSON("/api/guilds/" + encodeURIComponent(state.gid) + "/perms", {
          command: command,
          roleIds: checked
        }).then(function () {
          toast("Permessi salvati per /" + command + ".", "ok");
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

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildPermCommandSelect();
    initPermsForm();
    initConfirm();
    initNav();
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
