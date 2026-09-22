(function () {
  "use strict";

  var Dash = window.Dash || (window.Dash = {});

  function ensureState() {
    if (!Dash.state) Dash.state = {};
    if (!Dash.state.permsBaseline) Dash.state.permsBaseline = {};
    if (!Dash.state.permsDraft) Dash.state.permsDraft = {};
    if (!Dash.state.dirtyPerms) Dash.state.dirtyPerms = {};
    if (!Dash.state.listsCache) Dash.state.listsCache = {};
    if (!Dash.state.meta) Dash.state.meta = {};
  }

  function permCommands() {
    var cmds = ((Dash.PERM_COMMANDS || []).slice());
    var customs = (Dash.state && Dash.state.listsCache && Dash.state.listsCache.customCommands) || [];
    customs.forEach(function (c) {
      var n = "!" + (c && c.name ? String(c.name) : "");
      if (n.length > 1 && cmds.indexOf(n) === -1) cmds.push(n);
    });
    return cmds;
  }

  function usableRoles() {
    var roles = (Dash.state && Dash.state.meta && Dash.state.meta.roles) || [];
    return roles.filter(function (r) { return !r.managed; }).slice(0, 24);
  }

  function permsToMap(perms) {
    var map = {};
    if (!perms) return map;
    if (Array.isArray(perms)) {
      perms.forEach(function (p) {
        if (!p) return;
        var cmd = p.command || p.name;
        if (cmd) map[String(cmd)] = Array.isArray(p.roleIds) ? p.roleIds.map(String) : [];
      });
      return map;
    }
    Object.keys(perms).forEach(function (cmd) {
      var v = perms[cmd];
      map[String(cmd)] = Array.isArray(v) ? v.map(String) : [];
    });
    return map;
  }

  function sameIds(a, b) {
    a = a || [];
    b = b || [];
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function markDirty(cmd) {
    ensureState();
    var d = Dash.state.permsDraft[cmd] || [];
    if (sameIds(d, Dash.state.permsBaseline[cmd] || [])) delete Dash.state.dirtyPerms[cmd];
    else Dash.state.dirtyPerms[cmd] = true;
  }

  function openConfirmDialog(title, message) {
    if (Dash.openConfirm) return Dash.openConfirm(title, message);
    try {
      return Promise.resolve(window.confirm((title || "Confermi?") + "\n" + (message || "")));
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function limitedCount() {
    ensureState();
    var n = 0;
    Object.keys(Dash.state.permsDraft || {}).forEach(function (cmd) {
      if ((Dash.state.permsDraft[cmd] || []).length > 0) n++;
    });
    return n;
  }

  function ensurePermsToolbar() {
    if (typeof document === "undefined") return null;
    var bar = document.getElementById("perms-toolbar");
    if (bar) return bar;
    var scroll = document.querySelector(".matrix-scroll");
    bar = document.createElement("div");
    bar.id = "perms-toolbar";
    bar.className = "perms-toolbar";
    var span = document.createElement("span");
    span.id = "perms-limited-count";
    span.className = "muted small";
    span.textContent = "0 comandi limitati";
    bar.appendChild(span);
    if (scroll && scroll.parentNode) scroll.parentNode.insertBefore(bar, scroll);
    return bar;
  }

  function updatePermsToolbar() {
    var bar = ensurePermsToolbar();
    if (!bar) return;
    var span = bar.querySelector("#perms-limited-count") || document.getElementById("perms-limited-count");
    if (!span) return;
    var n = limitedCount();
    span.textContent = String(n) + (n === 1 ? " comando limitato" : " comandi limitati");
  }

  function resetMatrixRow(cmd) {
    ensureState();
    var draft = (Dash.state.permsDraft[cmd] || []).slice();
    if (draft.length === 0) return Promise.resolve(false);
    return openConfirmDialog("Azzera riga",
      "Rimuovere ogni limite per " + cmd + "? Tornera ai permessi Discord standard.").then(function (ok) {
      if (!ok) return false;
      Dash.state.permsDraft[cmd] = [];
      markDirty(cmd);
      renderMatrixFromDraft(false);
      Dash.updateDirtyBar();
      return true;
    });
  }

  function renderMatrix(perms) {
    ensureState();
    var map = permsToMap(perms);
    Dash.state.permsBaseline = {};
    Dash.state.permsDraft = {};
    Dash.state.dirtyPerms = {};
    permCommands().forEach(function (cmd) {
      var ids = (map[cmd] || []).slice().sort();
      Dash.state.permsBaseline[cmd] = ids;
      Dash.state.permsDraft[cmd] = ids.slice();
    });
    renderMatrixFromDraft(false);
    Dash.updateDirtyBar();
  }

  function renderMatrixFromDraft(reset) {
    ensureState();
    var head = Dash.$("perms-head");
    var body = Dash.$("perms-body");
    if (!head || !body) return;
    var cmds = permCommands();
    if (reset) {
      Dash.state.permsDraft = {};
      cmds.forEach(function (cmd) {
        Dash.state.permsDraft[cmd] = (Dash.state.permsBaseline[cmd] || []).slice();
      });
      Dash.state.dirtyPerms = {};
    }
    Dash.clear(head);
    Dash.clear(body);
    var roles = usableRoles();

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
      ed.setAttribute("colspan", "2");
      ed.className = "muted";
      ed.textContent = "Nessun ruolo disponibile.";
      er.appendChild(ed);
      body.appendChild(er);
      updatePermsToolbar();
      return;
    }

    cmds.forEach(function (cmd) {
      var tr = document.createElement("tr");
      if (Dash.state.dirtyPerms[cmd]) tr.className = "is-dirty";
      var th = document.createElement("th");
      th.setAttribute("scope", "row");
      var rb = document.createElement("button");
      rb.type = "button";
      rb.className = "m-cmd-btn";
      rb.title = "Attiva/disattiva tutti i ruoli per " + cmd;
      rb.textContent = cmd;
      rb.addEventListener("click", function () { toggleMatrixRow(cmd); });
      th.appendChild(rb);
      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "m-row-reset";
      reset.title = "Azzera riga";
      reset.setAttribute("aria-label", "Azzera riga " + cmd);
      reset.textContent = "✕";
      reset.addEventListener("click", function (ev) {
        ev.stopPropagation();
        resetMatrixRow(cmd).catch(function () {});
      });
      th.appendChild(reset);
      tr.appendChild(th);
      var draft = Dash.state.permsDraft[cmd] || [];
      roles.forEach(function (r) {
        var td = document.createElement("td");
        td.className = "m-cell";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = draft.indexOf(String(r.id)) !== -1;
        cb.setAttribute("aria-label", r.name + " può usare " + cmd);
        cb.addEventListener("change", function () {
          ensureState();
          var d = Dash.state.permsDraft[cmd] || [];
          var id = String(r.id);
          var ix = d.indexOf(id);
          if (cb.checked && ix === -1) d.push(id);
          if (!cb.checked && ix !== -1) d.splice(ix, 1);
          d.sort();
          Dash.state.permsDraft[cmd] = d;
          markDirty(cmd);
          tr.classList.toggle("is-dirty", !!Dash.state.dirtyPerms[cmd]);
          updatePermsToolbar();
          Dash.updateDirtyBar();
        });
        td.appendChild(cb);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    updatePermsToolbar();
  }

  function toggleMatrixRow(cmd) {
    ensureState();
    var roles = usableRoles().map(function (r) { return String(r.id); });
    var d = Dash.state.permsDraft[cmd] || [];
    var all = roles.length > 0 && roles.every(function (id) { return d.indexOf(id) !== -1; });
    Dash.state.permsDraft[cmd] = all ? [] : roles.slice().sort();
    markDirty(cmd);
    renderMatrixFromDraft(false);
    Dash.updateDirtyBar();
  }

  function toggleMatrixColumn(roleId) {
    ensureState();
    var id = String(roleId);
    var cmds = permCommands();
    var all = cmds.length > 0 && cmds.every(function (c) {
      return (Dash.state.permsDraft[c] || []).indexOf(id) !== -1;
    });
    cmds.forEach(function (c) {
      var d = Dash.state.permsDraft[c] || [];
      var ix = d.indexOf(id);
      if (all && ix !== -1) d.splice(ix, 1);
      if (!all && ix === -1) d.push(id);
      d.sort();
      Dash.state.permsDraft[c] = d;
      markDirty(c);
    });
    renderMatrixFromDraft(false);
    Dash.updateDirtyBar();
  }

  function putPermRow(cmd) {
    ensureState();
    var draft = (Dash.state.permsDraft[cmd] || []).slice();
    return Dash.putJSON("/api/guilds/" + encodeURIComponent(Dash.state.gid) + "/perms", {
      command: cmd,
      roleIds: draft
    }).then(function () {
      Dash.state.permsBaseline[cmd] = draft.slice().sort();
      delete Dash.state.dirtyPerms[cmd];
      renderMatrixFromDraft(false);
      Dash.updateDirtyBar();
    });
  }

  function syncMatrixCommands() {
    ensureState();
    var cmds = permCommands();
    var changed = false;
    cmds.forEach(function (cmd) {
      if (!Dash.state.permsDraft[cmd]) {
        Dash.state.permsDraft[cmd] = (Dash.state.permsBaseline[cmd] || []).slice();
        if (!Dash.state.permsBaseline[cmd]) Dash.state.permsBaseline[cmd] = [];
        changed = true;
      }
    });
    Object.keys(Dash.state.permsDraft).forEach(function (cmd) {
      if (cmds.indexOf(cmd) === -1 && !Dash.state.dirtyPerms[cmd]) {
        delete Dash.state.permsDraft[cmd];
        delete Dash.state.permsBaseline[cmd];
        changed = true;
      }
    });
    if (changed) {
      renderMatrixFromDraft(false);
      Dash.updateDirtyBar();
    }
  }

  async function savePerms() {
    ensureState();
    var cmds = Object.keys(Dash.state.dirtyPerms || {});
    if (cmds.length === 0) return;
    for (var i = 0; i < cmds.length; i++) {
      if ((Dash.state.permsDraft[cmds[i]] || []).length > 5) {
        if (Dash.openEntry) Dash.openEntry("perms");
        Dash.toast("Troppi ruoli per " + cmds[i] + ": massimo 5 per comando.", "err");
        throw new Error("too-many-roles");
      }
    }
    var resetCmds = cmds.filter(function (c) {
      var draft = Dash.state.permsDraft[c] || [];
      var base = Dash.state.permsBaseline[c] || [];
      return draft.length === 0 && base.length > 0;
    });
    if (resetCmds.length > 0) {
      var ok = await Dash.openConfirm("Rimuovere i limiti",
        "Rimuovere ogni limite per " + resetCmds.join(", ") + "? Torneranno ai permessi Discord standard.");
      if (!ok) throw new Error("cancelled");
    }
    for (var k = 0; k < cmds.length; k++) {
      await putPermRow(cmds[k]);
    }
  }

  function discardPerms() {
    ensureState();
    Dash.state.permsDraft = {};
    permCommands().forEach(function (cmd) {
      Dash.state.permsDraft[cmd] = (Dash.state.permsBaseline[cmd] || []).slice();
    });
    Dash.state.dirtyPerms = {};
    renderMatrixFromDraft(false);
  }

  Dash.renderMatrix = renderMatrix;
  Dash.syncMatrixCommands = syncMatrixCommands;

  if (!Array.isArray(Dash.onSave)) Dash.onSave = [];
  if (!Array.isArray(Dash.onDiscard)) Dash.onDiscard = [];
  Dash.onSave.push(savePerms);
  Dash.onDiscard.push(discardPerms);
})();
