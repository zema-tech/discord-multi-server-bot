/* Dashboard app — Vanilla JS, niente framework.
   Consuma ESATTAMENTE il contratto API del backend:
   GET /api/me | GET /api/guilds | GET /api/guilds/:gid
   GET /api/guilds/:gid/schema | GET /api/guilds/:gid/meta
   PUT /api/guilds/:gid/modules/:mod | PUT /api/guilds/:gid/perms
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
    modulesCache: {}
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(msg) {
    $("status").textContent = msg || "";
  }

  function toast(msg, kind) {
    var wrap = $("toasts");
    var el = document.createElement("div");
    el.className = "toast" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
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

  function getJSON(url) {
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(checkAuth)
      .then(function (res) {
        if (!res.ok) throw new Error("GET " + url + " -> " + res.status);
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
        if (!res.ok) throw new Error("PUT " + url + " -> " + res.status);
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
  function loadGuilds() {
    return getJSON("/api/guilds").then(function (guilds) {
      var list = $("guild-list");
      clear(list);
      var items = Array.isArray(guilds) ? guilds.filter(function (g) { return g && g.botPresent; }) : [];
      if (items.length === 0) {
        var li = document.createElement("li");
        li.className = "guild-empty";
        li.textContent = "Nessun server con il bot presente.";
        list.appendChild(li);
        return;
      }
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
    setStatus("Caricamento dati server…");
    $("guild-title").textContent = fallbackName || "Server " + gid;
    $("guild-sub").textContent = "Caricamento…";

    return Promise.all([
      getJSON("/api/guilds/" + encodeURIComponent(gid)),
      getJSON("/api/guilds/" + encodeURIComponent(gid) + "/schema"),
      getJSON("/api/guilds/" + encodeURIComponent(gid) + "/meta")
    ]).then(function (parts) {
      var detail = parts[0];
      var schema = parts[1];
      state.meta = normalizeMeta(parts[2]);
      state.modulesCache = (detail && detail.modules) || {};
      renderDetail(detail, fallbackName);
      renderSchema(Array.isArray(schema) ? schema : [], state.modulesCache);
      renderPerms(detail && detail.perms);
      buildPermCommandSelect();
      buildPermRoles(state.meta.roles);
      setStatus("");
    }).catch(function (err) {
      if (err && err.message === "unauthorized") return;
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
      if (current !== undefined && current !== null) input.value = String(current);
    } else if (type === "channel" || type === "role") {
      input = document.createElement("select");
      var opts = type === "channel" ? state.meta.channels : state.meta.roles;
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "— seleziona —";
      input.appendChild(none);
      (opts || []).forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.id || o.value || "";
        opt.textContent = o.name || o.label || opt.value;
        if (String(current) === String(opt.value) && opt.value !== "") opt.selected = true;
        input.appendChild(opt);
      });
    } else {
      // type "text" (o sconosciuto -> fallback text)
      if (longTextField(field.key)) {
        input = document.createElement("textarea");
        input.value = current !== undefined && current !== null ? String(current) : "";
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = current !== undefined && current !== null ? String(current) : "";
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

      box.appendChild(card);
    });
  }

  function readControlValue(ctl) {
    var t = ctl.dataset.ftype;
    if (t === "bool") return ctl.checked;
    if (t === "number") {
      if (ctl.value === "") return null;
      var n = Number(ctl.value);
      return isNaN(n) ? ctl.value : n;
    }
    return ctl.value;
  }

  function saveModule(modName, form, btn) {
    var body = {};
    var controls = form.querySelectorAll("[data-fkey]");
    controls.forEach(function (ctl) {
      body[ctl.dataset.fkey] = readControlValue(ctl);
    });
    btn.disabled = true;
    putJSON("/api/guilds/" + encodeURIComponent(state.gid) + "/modules/" + encodeURIComponent(modName), body)
      .then(function () {
        state.modulesCache[modName] = body;
        toast("Modulo " + modName + " salvato.", "ok");
      })
      .catch(function (err) {
        if (err && err.message === "unauthorized") return;
        toast("Errore salvataggio " + modName + ": " + err.message, "err");
      })
      .then(function () { btn.disabled = false; });
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
      var checked = Array.prototype.slice.call(
        document.querySelectorAll('#perm-roles input[name="roleIds"]:checked')
      ).map(function (cb) { return cb.value; });
      var btn = $("perm-save");
      btn.disabled = true;
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
      }).then(function () { btn.disabled = false; });
    });
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildPermCommandSelect();
    initPermsForm();
    setStatus("Connessione…");
    loadMe()
      .then(loadGuilds)
      .then(function () { setStatus(""); })
      .catch(function (err) {
        if (err && err.message === "unauthorized") return;
        setStatus("Errore: " + (err && err.message ? err.message : err) + " — accedi da /login.");
      });
  });
})();
