/* lists.js — liste dashboard (autoresponder, comandi custom, ricompense, shop, reaction roles + fallback generico).
   Usa SOLO window.Dash di core.js. Nessuna fetch diretta, nessun literal modulo nelle righe fetch. */
(function () {
  "use strict";

  var Dash = window.Dash || (window.Dash = {});
  Dash.state = Dash.state || { gid: null, meta: { roles: [] }, listsCache: {} };
  if (!Dash.state.meta) Dash.state.meta = { roles: [] };
  if (!Dash.state.listsCache) Dash.state.listsCache = {};

  function $(id) {
    if (typeof Dash.$ === "function") return Dash.$(id);
    return document.getElementById(id);
  }
  function clear(el) {
    if (!el) return;
    if (typeof Dash.clear === "function") return Dash.clear(el);
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  function toast(msg, kind) {
    if (typeof Dash.toast === "function") return Dash.toast(msg, kind);
  }
  function getJSON(url) {
    return Dash.getJSON(url);
  }
  function putModule(mod, body) {
    return Dash.putModule(mod, body);
  }
  function iconEl(name) {
    if (typeof Dash.iconEl === "function") return Dash.iconEl(name);
    var s = document.createElement("span");
    s.className = "svg-ico";
    s.setAttribute("aria-hidden", "true");
    return s;
  }
  function openConfirm(title, message) {
    if (typeof Dash.openConfirm === "function") return Dash.openConfirm(title, message);
    try {
      return Promise.resolve(window.confirm((title || "Confermi?") + "\n" + (message || "")));
    } catch (e) {
      return Promise.resolve(false);
    }
  }
  function roleName(id) {
    if (typeof Dash.roleName === "function") return Dash.roleName(id);
    var roles = (Dash.state && Dash.state.meta && Dash.state.meta.roles) || [];
    for (var i = 0; i < roles.length; i++) {
      if (String(roles[i].id) === String(id)) return roles[i].name;
    }
    return id;
  }
  function currentGid() {
    return (Dash.state && Dash.state.gid) || null;
  }
  function fmtNum(n) {
    if (n === null || n === undefined) return "—";
    try { return Number(n).toLocaleString("it-IT"); } catch (e) { return String(n); }
  }
  function afterMutation(isCustomCommands) {
    try { Dash.refreshNav?.(); } catch (e) {}
    if (isCustomCommands) {
      try { Dash.syncMatrixCommands?.(); } catch (e) {}
    }
  }

  /* ---------- bottoni icona locali (NON usare Dash.deleteBtn) ---------- */
  function editBtn(label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn";
    b.setAttribute("aria-label", label);
    b.setAttribute("title", label);
    b.appendChild(iconEl("edit"));
    b.addEventListener("click", onClick);
    return b;
  }
  function deleteBtn(label, onClick) {
    var del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn danger";
    del.setAttribute("aria-label", label);
    del.setAttribute("title", label);
    del.appendChild(iconEl("trash"));
    del.addEventListener("click", onClick);
    return del;
  }
  function setSaving(btn, saving) {
    if (!btn) return;
    btn.disabled = !!saving;
    if (saving) {
      btn.dataset.label = btn.textContent;
      btn.textContent = "Attendi…";
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
    }
  }

  /* ---------- select ruoli ---------- */
  function fillRoleSelect(selId) {
    var sel = $(selId);
    if (!sel) return;
    clear(sel);
    var roles = (Dash.state && Dash.state.meta && Dash.state.meta.roles) || [];
    var usable = roles.filter(function (r) { return !r.managed; });
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
  function buildRoleSelects() {
    fillRoleSelect("rw-role");
    fillRoleSelect("sh-role");
    fillRoleSelect("rr-role");
  }

  /* ---------- render liste ---------- */
  var KNOWN_KEYS = ["autoresponder", "customCommands", "levelRewards", "shop", "rrOptions"];

  function emptyRow(ul, msg) {
    var li = document.createElement("li");
    li.className = "muted";
    li.textContent = msg;
    ul.appendChild(li);
  }

  function renderAR(arr) {
    var ul = $("ar-list");
    if (!ul) return;
    clear(ul);
    if (!arr || arr.length === 0) {
      emptyRow(ul, "Nessuna risposta automatica. Aggiungi la prima qui sotto.");
      return;
    }
    arr.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "itemrow";
      var txt = document.createElement("span");
      var mode = t.mode && t.mode !== "include" ? " [" + t.mode + "]" : "";
      txt.textContent = "«" + t.match + "» → " + String(t.response).slice(0, 80) + mode;
      li.appendChild(txt);
      li.appendChild(deleteBtn("Elimina risposta per " + t.match, function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Elimina risposta", "Eliminare la risposta per «" + t.match + "»?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modAR = "autoresponder";
          putModule(modAR, { action: "remove", id: t.id })
            .then(function (r) {
              Dash.state.listsCache.autoresponder = (r && r.list) || [];
              renderAR(Dash.state.listsCache.autoresponder);
              afterMutation(false);
              toast("Risposta eliminata.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li);
    });
  }

  function resetCcForm() {
    Dash.state.editingCmd = null;
    var nameEl = $("cc-name");
    var respEl = $("cc-response");
    if (nameEl) { nameEl.value = ""; nameEl.readOnly = false; }
    if (respEl) respEl.value = "";
    var btn = document.querySelector('#cc-form button[type="submit"]');
    if (btn) btn.textContent = "Salva comando";
    var cancel = $("cc-cancel");
    if (cancel && cancel.parentNode) cancel.parentNode.removeChild(cancel);
  }

  function startCcEdit(c) {
    Dash.state.editingCmd = c.name;
    var nameEl = $("cc-name");
    var respEl = $("cc-response");
    if (nameEl) { nameEl.value = c.name; nameEl.readOnly = true; }
    if (respEl) respEl.value = c.response || "";
    var btn = document.querySelector('#cc-form button[type="submit"]');
    if (btn) btn.textContent = "Salva modifiche";
    if (!$("cc-cancel") && btn && btn.parentNode) {
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.id = "cc-cancel";
      cancel.className = "btn btn-secondary btn-sm";
      cancel.textContent = "Annulla";
      cancel.addEventListener("click", resetCcForm);
      btn.parentNode.insertBefore(cancel, btn);
    }
    var form = $("cc-form");
    var card = form && form.closest ? form.closest(".card") : null;
    if (card && card.scrollIntoView) {
      try { card.scrollIntoView({ block: "nearest" }); } catch (e) {}
    }
    if (respEl && respEl.focus) respEl.focus();
  }

  function renderCC(arr) {
    var ul = $("cc-list");
    if (!ul) return;
    clear(ul);
    if (!arr || arr.length === 0) {
      emptyRow(ul, "Nessun comando personalizzato (massimo 20).");
      return;
    }
    arr.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = "!" + c.name + " → " + String(c.response || "").slice(0, 80);
      li.appendChild(txt);
      var acts = document.createElement("span");
      acts.className = "item-acts";
      acts.appendChild(editBtn("Modifica comando !" + c.name, function () { startCcEdit(c); }));
      acts.appendChild(deleteBtn("Elimina comando !" + c.name, function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Elimina comando", "Eliminare il comando !" + c.name + "?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modCC = "commands";
          putModule(modCC, { action: "remove", name: c.name })
            .then(function (r) {
              Dash.state.listsCache.customCommands = (r && r.list) || [];
              renderCC(Dash.state.listsCache.customCommands);
              afterMutation(true);
              toast("Comando eliminato.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      li.appendChild(acts);
      ul.appendChild(li);
    });
  }

  function renderRW(arr) {
    var ul = $("rw-list");
    if (!ul) return;
    clear(ul);
    if (!arr || arr.length === 0) {
      emptyRow(ul, "Nessuna ricompensa. Abbina un ruolo a un livello qui sotto.");
      return;
    }
    arr.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = "Livello " + r.level + " → " + roleName(r.roleId);
      li.appendChild(txt);
      li.appendChild(deleteBtn("Elimina ricompensa livello " + r.level, function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Elimina ricompensa", "Eliminare la ricompensa del livello " + r.level + "?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modRW = "rewards";
          putModule(modRW, { action: "remove", level: r.level })
            .then(function (res) {
              Dash.state.listsCache.levelRewards = (res && res.list) || [];
              renderRW(Dash.state.listsCache.levelRewards);
              afterMutation(false);
              toast("Ricompensa eliminata.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li);
    });
  }

  function renderShop(arr) {
    var ul = $("sh-list");
    if (!ul) return;
    clear(ul);
    if (!arr || arr.length === 0) {
      emptyRow(ul, "Negozio vuoto: metti in vendita il primo ruolo qui sotto.");
      return;
    }
    arr.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "itemrow";
      var txt = document.createElement("span");
      txt.textContent = roleName(it.roleId) + " → " + fmtNum(it.price) + " monete";
      li.appendChild(txt);
      li.appendChild(deleteBtn("Rimuovi dal negozio " + roleName(it.roleId), function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Rimuovi dal negozio", "Rimuovere " + roleName(it.roleId) + " dal negozio?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modSh = "shop";
          putModule(modSh, { action: "remove", roleId: it.roleId })
            .then(function () { return refreshShop(); })
            .then(function () {
              afterMutation(false);
              toast("Oggetto rimosso.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li);
    });
  }

  function renderRR(arr) {
    var ul = $("rr-list");
    if (!ul) return;
    clear(ul);
    if (!arr || arr.length === 0) {
      emptyRow(ul, "Nessuna opzione: collega la prima emoji a un ruolo qui sotto.");
      return;
    }
    arr.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "itemrow";
      var txt = document.createElement("span");
      var head = it.emoji ? it.emoji + " " : "";
      txt.textContent = head + (it.label || it.roleId) + " → " + roleName(it.roleId);
      li.appendChild(txt);
      li.appendChild(deleteBtn("Rimuovi opzione " + (it.label || it.roleId), function (ev) {
        var btn = ev.currentTarget;
        openConfirm("Rimuovi opzione", "Rimuovere l\u2019opzione con etichetta " + (it.label || it.roleId) + "?").then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          var modRR = "reactionRoles";
          putModule(modRR, { action: "remove-option", roleId: it.roleId })
            .then(function () { return refreshRROptions(); })
            .then(function () {
              afterMutation(false);
              toast("Opzione rimossa.", "ok");
            })
            .catch(function (err) {
              if (err && err.message === "unauthorized") return;
              toast("Errore: " + err.message, "err");
            })
            .then(function () { btn.disabled = false; });
        });
      }));
      ul.appendChild(li);
    });
  }

  function renderGeneric(lists) {
    var sec = $("sec-lists");
    if (!sec || !lists || typeof lists !== "object") return;
    var grid = sec.querySelector(".lists-grid") || sec;
    var olds = grid.querySelectorAll("[data-generic-card]");
    for (var i = 0; i < olds.length; i++) {
      if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
    }
    Object.keys(lists).forEach(function (key) {
      if (KNOWN_KEYS.indexOf(key) !== -1) return;
      var val = lists[key];
      if (!Array.isArray(val)) return;
      var card = document.createElement("div");
      card.className = "card";
      card.setAttribute("data-generic-card", key);
      var h = document.createElement("h3");
      h.textContent = key;
      card.appendChild(h);
      var p = document.createElement("p");
      p.className = "muted small";
      p.textContent = val.length === 0 ? "Nessuna voce." : String(val.length) + " voci.";
      card.appendChild(p);
      var ul = document.createElement("ul");
      ul.className = "itemlist";
      if (val.length === 0) {
        var li0 = document.createElement("li");
        li0.className = "muted";
        li0.textContent = "Nessuna voce.";
        ul.appendChild(li0);
      } else {
        val.slice(0, 50).forEach(function (entry) {
          var li = document.createElement("li");
          li.className = "itemrow";
          var txt = document.createElement("span");
          var s = "";
          try { s = JSON.stringify(entry); } catch (e) { s = String(entry); }
          txt.textContent = String(s).slice(0, 120);
          li.appendChild(txt);
          ul.appendChild(li);
        });
      }
      card.appendChild(ul);
      grid.appendChild(card);
    });
  }

  function renderLists(lists) {
    var l = lists || {};
    renderAR(l.autoresponder);
    renderCC(l.customCommands);
    renderRW(l.levelRewards);
    renderShop(l.shop);
    renderRR(l.rrOptions);
    renderGeneric(l);
  }

  function refreshRROptions() {
    var gid = currentGid();
    return getJSON("/api/guilds/" + encodeURIComponent(gid)).then(function (detail) {
      Dash.state.listsCache.rrOptions = (detail && detail.lists && detail.lists.rrOptions) || [];
      renderRR(Dash.state.listsCache.rrOptions);
    });
  }

  function refreshShop() {
    var gid = currentGid();
    return getJSON("/api/guilds/" + encodeURIComponent(gid)).then(function (detail) {
      Dash.state.listsCache.shop = (detail && detail.lists && detail.lists.shop) || [];
      renderShop(Dash.state.listsCache.shop);
    });
  }

  /* ---------- form ---------- */
  function maybeCounter(id, limit) {
    try {
      var input = $(id);
      if (!input) return;
      if (typeof Dash.attachCounter !== "function") return;
      var c = Dash.attachCounter(input, limit);
      if (c && c.nodeType === 1 && !c.parentNode && input.parentNode) {
        input.parentNode.appendChild(c);
      }
    } catch (e) {}
  }

  function bindFormsOnce() {
    if (bindFormsOnce.done) return;
    bindFormsOnce.done = true;
    maybeCounter("ar-match", 200);
    maybeCounter("ar-response", 1500);
    maybeCounter("cc-name", 20);
    maybeCounter("cc-response", 1500);
    maybeCounter("rr-label", 100);
    maybeCounter("rr-emoji", 50);

    var arForm = $("ar-form");
    if (arForm) arForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!currentGid()) { toast("Seleziona prima un server.", "err"); return; }
      var matchEl = $("ar-match");
      var respEl = $("ar-response");
      var match = matchEl ? matchEl.value.trim() : "";
      var response = respEl ? respEl.value.trim() : "";
      if (!match || !response) { toast("Parola e risposta sono obbligatorie.", "err"); return; }
      var modeSel = $("ar-mode");
      var mode = modeSel && (modeSel.value === "exact" || modeSel.value === "regex") ? modeSel.value : "include";
      if (modeSel && modeSel.value !== "exact" && modeSel.value !== "regex" && modeSel.value !== "include") mode = "include";
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modAdd = "autoresponder";
      putModule(modAdd, { action: "add", match: match, response: response, mode: mode })
        .then(function (r) {
          Dash.state.listsCache.autoresponder = (r && r.list) || Dash.state.listsCache.autoresponder;
          renderAR(Dash.state.listsCache.autoresponder);
          afterMutation(false);
          if (matchEl) matchEl.value = "";
          if (respEl) respEl.value = "";
          toast("Risposta aggiunta.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });

    var ccForm = $("cc-form");
    if (ccForm) ccForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!currentGid()) { toast("Seleziona prima un server.", "err"); return; }
      var nameEl = $("cc-name");
      var respEl = $("cc-response");
      var name = nameEl ? nameEl.value.trim().toLowerCase() : "";
      var response = respEl ? respEl.value.trim() : "";
      if (!/^[a-z0-9-]{2,20}$/.test(name)) { toast("Nome non valido: 2-20 caratteri (a-z, 0-9, -).", "err"); return; }
      if (!response) { toast("La risposta è obbligatoria.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var isEdit = Dash.state.editingCmd && Dash.state.editingCmd === name;
      var modCmd = "commands";
      putModule(modCmd, { action: isEdit ? "update" : "create", name: name, response: response })
        .then(function (r) {
          Dash.state.listsCache.customCommands = (r && r.list) || Dash.state.listsCache.customCommands;
          renderCC(Dash.state.listsCache.customCommands);
          afterMutation(true);
          resetCcForm();
          toast(isEdit ? "Comando !" + name + " aggiornato." : "Comando !" + name + " salvato.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });

    var rwForm = $("rw-form");
    if (rwForm) rwForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!currentGid()) { toast("Seleziona prima un server.", "err"); return; }
      var levelEl = $("rw-level");
      var roleEl = $("rw-role");
      var level = Math.floor(Number(levelEl ? levelEl.value : NaN));
      var roleId = roleEl ? roleEl.value : "";
      if (!Number.isFinite(level) || level < 1 || level > 100) { toast("Livello non valido (1-100).", "err"); return; }
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modSet = "rewards";
      putModule(modSet, { action: "set", level: level, roleId: roleId })
        .then(function (r) {
          Dash.state.listsCache.levelRewards = (r && r.list) || Dash.state.listsCache.levelRewards;
          renderRW(Dash.state.listsCache.levelRewards);
          afterMutation(false);
          if (levelEl) levelEl.value = "";
          toast("Ricompensa salvata.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });

    var shForm = $("sh-form");
    if (shForm) shForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!currentGid()) { toast("Seleziona prima un server.", "err"); return; }
      var roleEl = $("sh-role");
      var priceEl = $("sh-price");
      var roleId = roleEl ? roleEl.value : "";
      var price = Math.floor(Number(priceEl ? priceEl.value : NaN));
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      if (!Number.isFinite(price) || price < 1 || price > 10000000) { toast("Prezzo non valido (1-10.000.000).", "err"); return; }
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modShop = "shop";
      putModule(modShop, { action: "set", roleId: roleId, price: price })
        .then(function () { return refreshShop(); })
        .then(function () {
          afterMutation(false);
          if (priceEl) priceEl.value = "";
          toast("Oggetto in vendita.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });

    var rrForm = $("rr-form");
    if (rrForm) rrForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!currentGid()) { toast("Seleziona prima un server.", "err"); return; }
      var roleEl = $("rr-role");
      var labelEl = $("rr-label");
      var emojiEl = $("rr-emoji");
      var roleId = roleEl ? roleEl.value : "";
      if (!roleId) { toast("Seleziona un ruolo.", "err"); return; }
      var label = labelEl ? labelEl.value.trim().slice(0, 100) : "";
      var emoji = emojiEl ? emojiEl.value.trim().slice(0, 50) : "";
      var btn = ev.target.querySelector('button[type="submit"]');
      setSaving(btn, true);
      var modRR = "reactionRoles";
      putModule(modRR, { action: "add-option", roleId: roleId, label: label, emoji: emoji })
        .then(function () { return refreshRROptions(); })
        .then(function () {
          afterMutation(false);
          if (labelEl) labelEl.value = "";
          if (emojiEl) emojiEl.value = "";
          toast("Opzione aggiunta.", "ok");
        })
        .catch(function (err) {
          if (err && err.message === "unauthorized") return;
          toast("Errore: " + err.message, "err");
        })
        .then(function () { setSaving(btn, false); });
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindFormsOnce);
    } else {
      bindFormsOnce();
    }
  }

  Dash.renderLists = renderLists;
  Dash.buildRoleSelects = buildRoleSelects;
  Dash.__lists = {
    renderLists: renderLists,
    buildRoleSelects: buildRoleSelects,
    renderAR: renderAR,
    renderCC: renderCC,
    renderRW: renderRW,
    renderShop: renderShop,
    renderRR: renderRR,
    resetCcForm: resetCcForm
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Dash.__lists;
  }
})();
