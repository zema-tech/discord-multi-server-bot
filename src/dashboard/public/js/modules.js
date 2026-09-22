/* modules.js — sidebar moduli + form schema-driven.
   Usa SOLO window.Dash di core.js (stato, costanti, API, helpers).
   Nessuna fetch qui: scritture solo via Dash.putModule(variabile, body). */
(function () {
  "use strict";

  var Dash = window.Dash || (window.Dash = {});
  var state = Dash.state || (Dash.state = {});
  if (!state.pending) state.pending = {};
  if (!state.dirtyModules) state.dirtyModules = {};
  if (!state.baseline) state.baseline = {};
  if (!state.listsCache) state.listsCache = {};
  if (!state.modulesCache) state.modulesCache = {};
  if (!state.permsBaseline) state.permsBaseline = {};
  if (state.moduleSection === undefined) state.moduleSection = "all";
  if (state.modSearch === undefined) state.modSearch = "";
  if (state.entry === undefined) state.entry = null;
  if (state.activeModule === undefined) state.activeModule = null;

  var MODULE_ICONS = Dash.MODULE_ICONS || {
    general: "sliders", welcome: "flag", automod: "shield",
    autorole: "users", levels: "star", rewards: "award",
    tickets: "ticket", ticketsPlus: "ticket", tempvoice: "mic",
    ai: "cpu", aiPlus: "cpu", starboard: "star",
    confessioni: "eye", autoresponder: "message", commands: "terminal",
    reactionRoles: "check", lockdown: "lock", shop: "cart",
    logging: "list", panoramica: "chart", perms: "lock"
  };
  if (!Dash.MODULE_ICONS) Dash.MODULE_ICONS = MODULE_ICONS;

  var NUMBER_RANGES = Dash.NUMBER_RANGES || {
    maxMentions: [1, 20], maxPerUser: [1, 10], autoCloseDays: [0, 90],
    maxCapsPercent: [10, 100], threshold: [1, 100], delaySeconds: [0, 3600]
  };
  var TEXT_LIMITS = Dash.TEXT_LIMITS || {
    welcomeMessage: 500, goodbyeMessage: 500, systemPrompt: 1000,
    badWords: 1000, title: 100, description: 500
  };
  var DEFAULT_TEXT_MAX = Dash.DEFAULT_TEXT_MAX || 1000;
  var NONE_VALUE = Dash.NONE_VALUE || "__none__";

  function $(id) {
    if (typeof Dash.$ === "function") return Dash.$(id);
    return document.getElementById(id);
  }
  function clear(el) {
    if (typeof Dash.clear === "function") return Dash.clear(el);
    if (el) while (el.firstChild) el.removeChild(el.firstChild);
  }
  function iconEl(name) {
    if (typeof Dash.iconEl === "function") return Dash.iconEl(name);
    var s = document.createElement("span");
    s.className = "svg-ico";
    s.setAttribute("aria-hidden", "true");
    var icons = Dash.ICONS || {};
    if (icons[name]) {
      var tmp = document.createElement("span");
      tmp.className = "svg-ico";
      tmp.setAttribute("aria-hidden", "true");
      tmp.innerHTML = icons[name];
      return tmp;
    }
    return s;
  }
  function toast(msg, kind) {
    if (typeof Dash.toast === "function") return Dash.toast(msg, kind);
  }
  function prefersReduced() {
    if (typeof Dash.prefersReduced === "function") return Dash.prefersReduced();
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) { return false; }
  }
  function updateDirtyBar() {
    if (typeof Dash.updateDirtyBar === "function") Dash.updateDirtyBar();
  }
  function insertVarAt(textarea, variable) {
    if (typeof Dash.insertVar === "function") return Dash.insertVar(textarea, variable);
    try {
      var start = textarea.selectionStart !== null && textarea.selectionStart !== undefined
        ? textarea.selectionStart : textarea.value.length;
      var end = textarea.selectionEnd !== null && textarea.selectionEnd !== undefined
        ? textarea.selectionEnd : textarea.value.length;
      var v = textarea.value;
      textarea.value = v.slice(0, start) + variable + v.slice(end);
      textarea.focus();
      var pos = start + variable.length;
      try { textarea.setSelectionRange(pos, pos); } catch (e) {}
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (e) {}
  }

  function sectionOf(mod) {
    return (mod && mod.section) || "Altro";
  }
  function schemaOf(modName) {
    var found = null;
    (state.schema || []).forEach(function (m) { if (m && m.module === modName) found = m; });
    if (found) return found;
    if (modName === "logging") {
      return {
        module: "logging",
        title: "Log & canali",
        section: "Generale",
        description: "Canale dei log di moderazione.",
        fields: [{ key: "logChannelId", label: "Canale log", type: "channel" }]
      };
    }
    return null;
  }
  function editableModules() {
    return (state.schema || []).filter(function (m) { return m && !m.custom && m.module !== "logging"; });
  }

  function moduleEntries() {
    var entries = [{ id: "panoramica", title: "Panoramica", icon: "chart", kind: "panoramica", section: "Panoramica" }];
    var fixed = [
      ["welcome", "Welcome / Goodbye"], ["automod", null], ["levels", null],
      ["tickets", null], ["ai", null], ["logging", "Log & canali"],
      ["autorole", null], ["tempvoice", null], ["starboard", null]
    ];
    var seen = {};
    fixed.forEach(function (f) {
      var spec = schemaOf(f[0]);
      if (!spec) return;
      seen[f[0]] = true;
      entries.push({
        id: f[0],
        title: f[1] || spec.title || f[0],
        icon: MODULE_ICONS[f[0]] || "sliders",
        kind: "form",
        section: sectionOf(spec),
        mod: f[0]
      });
    });
    var lists = [
      ["autoresponder", "Risposte automatiche", "Liste", "ar"],
      ["commands", "Comandi custom", "Liste", "cc"],
      ["rewards", "Ricompense", "Livelli", "rw"],
      ["shop", "Negozio", "Economia", "sh"]
    ];
    lists.forEach(function (l) {
      entries.push({
        id: l[0],
        title: l[1],
        icon: MODULE_ICONS[l[0]] || "list",
        kind: "list",
        section: l[2],
        card: l[3]
      });
    });
    entries.push({ id: "perms", title: "Permessi comandi", icon: MODULE_ICONS.perms || "lock", kind: "perms", section: "Controllo" });
    editableModules().forEach(function (m) {
      if (seen[m.module]) return;
      entries.push({
        id: m.module,
        title: m.title || m.module,
        icon: MODULE_ICONS[m.module] || "sliders",
        kind: "form",
        section: sectionOf(m),
        mod: m.module
      });
    });
    return entries;
  }

  function filteredEntries() {
    var q = String(state.modSearch || "").trim().toLowerCase();
    return moduleEntries().filter(function (e) {
      if (state.moduleSection !== "all" && e.section !== state.moduleSection) return false;
      if (!q) return true;
      var hay = (e.title + " " + (e.section || "")).toLowerCase();
      if (hay.indexOf(q) !== -1) return true;
      if (e.kind === "form") {
        var spec = schemaOf(e.mod);
        if (spec) {
          var fh = (spec.fields || []).map(function (f) { return (f.label || "") + " " + (f.key || ""); }).join(" ").toLowerCase();
          if (((spec.description || "") + " " + fh).toLowerCase().indexOf(q) !== -1) return true;
        }
      }
      return false;
    });
  }

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

  function entryStatus(entry) {
    if (!entry) return false;
    if (entry.kind === "form") return moduleStatus(entry.mod);
    if (entry.id === "autoresponder") return ((state.listsCache && state.listsCache.autoresponder) || []).length > 0;
    if (entry.id === "commands") return ((state.listsCache && state.listsCache.customCommands) || []).length > 0;
    if (entry.id === "rewards") return ((state.listsCache && state.listsCache.levelRewards) || []).length > 0;
    if (entry.id === "shop") return ((state.listsCache && state.listsCache.shop) || []).length > 0;
    if (entry.id === "perms") {
      var base = state.permsBaseline || {};
      return Object.keys(base).some(function (c) { return (base[c] || []).length > 0; });
    }
    return true;
  }

  function statusPill(on) {
    var s = document.createElement("span");
    s.className = "mod-status" + (on ? " st-on" : "");
    s.textContent = on ? "Attivo" : "Spento";
    return s;
  }

  function findEntry(id) {
    var found = null;
    moduleEntries().forEach(function (e) { if (e.id === id) found = e; });
    return found || { id: id, kind: "form", mod: id, title: id, icon: "sliders", section: "Altro" };
  }

  function showSection(secId) {
    ["sec-panoramica", "sec-module", "sec-lists", "sec-perms"].forEach(function (id) {
      var el = $(id);
      if (el) el.hidden = id !== secId;
    });
  }

  function renderModuleList() {
    var box = $("module-sections");
    if (box) {
      clear(box);
      var counts = {};
      moduleEntries().forEach(function (e) {
        counts[e.section] = (counts[e.section] || 0) + 1;
      });
      var opts = [{ v: "all", l: "Tutte" }].concat(Object.keys(counts).map(function (s) {
        return { v: s, l: s };
      }));
      opts.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + (state.moduleSection === o.v ? " is-active" : "");
        b.textContent = o.v === "all" ? o.l : o.l + " · " + counts[o.v];
        b.setAttribute("aria-pressed", state.moduleSection === o.v ? "true" : "false");
        b.addEventListener("click", function () {
          state.moduleSection = o.v;
          Dash.renderModuleList();
        });
        box.appendChild(b);
      });
    }
    var nav = $("module-list");
    if (!nav) return;
    clear(nav);
    nav.setAttribute("aria-busy", "false");
    var list = filteredEntries();
    if (!state.entry || list.every(function (e) { return e.id !== state.entry; })) {
      state.entry = "panoramica";
    }
    if (list.length === 0) {
      var p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "Nessun modulo trovato.";
      nav.appendChild(p);
      return;
    }
    list.forEach(function (e) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mod-item" + (state.entry === e.id ? " is-active" : "");
      b.dataset.entry = e.id;
      b.setAttribute("aria-current", state.entry === e.id ? "true" : "false");
      b.appendChild(iconEl(e.icon));
      var tx = document.createElement("span");
      tx.className = "mod-item-txt";
      var tt = document.createElement("span");
      tt.className = "mod-item-title";
      tt.textContent = e.title;
      tx.appendChild(tt);
      var ss = document.createElement("span");
      ss.className = "mod-item-sec";
      ss.textContent = e.section;
      tx.appendChild(ss);
      b.appendChild(tx);
      if (e.id !== "panoramica") b.appendChild(statusPill(entryStatus(e)));
      var chev = iconEl("chev");
      try { chev.classList.add("mod-chev"); } catch (err) {}
      b.appendChild(chev);
      if (e.kind === "form" && state.dirtyModules[e.mod]) {
        var dot = document.createElement("span");
        dot.className = "dirty-dot";
        dot.setAttribute("aria-label", "Modifiche non salvate");
        b.appendChild(dot);
      }
      b.addEventListener("click", function () { Dash.openEntry(e.id); });
      nav.appendChild(b);
    });
  }

  function openEntry(id) {
    var e = findEntry(id);
    state.entry = id;
    if (e.kind === "form") state.activeModule = e.mod;
    Dash.refreshNav();
    if (e.kind === "panoramica") {
      showSection("sec-panoramica");
    } else if (e.kind === "form") {
      showSection("sec-module");
      renderActiveModule();
    } else if (e.kind === "list") {
      showSection("sec-lists");
      var form = $("ar-form");
      if (e.card === "cc") form = $("cc-form");
      else if (e.card === "rw") form = $("rw-form");
      else if (e.card === "sh") form = $("sh-form");
      var card = form ? form.closest(".card") : null;
      if (card && card.scrollIntoView) {
        try { card.scrollIntoView({ block: "nearest", behavior: prefersReduced() ? "auto" : "smooth" }); } catch (err) {}
      }
    } else if (e.kind === "perms") {
      showSection("sec-perms");
    }
  }

  function focusModule(modName) {
    state.entry = modName;
    state.activeModule = modName;
    Dash.renderModuleList();
    showSection("sec-module");
    renderActiveModule();
  }

  function refreshNav() {
    Dash.renderModuleList();
  }

  /* ---------- Form schema-driven ---------- */

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

  function attachCounter(input, limit) {
    var counter = document.createElement("div");
    counter.className = "char-counter muted small";
    var update = function () { counter.textContent = String(input.value.length) + "/" + limit; };
    input.addEventListener("input", update);
    update();
    return counter;
  }

  function varChipsRow(textarea) {
    var row = document.createElement("div");
    row.className = "var-chips";
    ["{user}", "{server}", "{count}"].forEach(function (v) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip-var";
      chip.textContent = v;
      chip.setAttribute("aria-label", "Inserisci variabile " + v);
      chip.addEventListener("click", function () { insertVarAt(textarea, v); });
      row.appendChild(chip);
    });
    return row;
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
      var roles = ((state.meta && state.meta.roles) || []).filter(function (r) { return !r.managed; });
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
      var list = type === "channel"
        ? ((state.meta && state.meta.channels) || [])
        : ((state.meta && state.meta.roles) || []);
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

  function renderActiveModule() {
    var box = $("modules");
    if (!box) return;
    clear(box);
    var mod = schemaOf(state.activeModule);
    if (!mod) {
      var emptyIcon = (typeof Dash.emptyBox === "function")
        ? Dash.emptyBox("grid", "Seleziona un modulo", "Scegli un modulo dalla lista.")
        : null;
      if (emptyIcon) { box.appendChild(emptyIcon); return; }
      var pe = document.createElement("p");
      pe.className = "muted small";
      pe.textContent = "Seleziona un modulo dalla lista.";
      box.appendChild(pe);
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
      try { label.htmlFor = (inner || ctl).id; } catch (err) {}
      wrap.appendChild(label);
      wrap.appendChild(ctl);
      if (field.key === "welcomeMessage" || field.key === "goodbyeMessage" || field.key === "systemPrompt") {
        var ta = (inner || ctl);
        if (ta && ta.tagName === "TEXTAREA") wrap.appendChild(varChipsRow(ta));
      }
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
      if (typeof Dash.saveAllDirty === "function") Dash.saveAllDirty();
      else if (typeof Dash.requestSave === "function") Dash.requestSave();
      else saveModulesSaver();
    });
    card.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t && t.dataset && t.dataset.fkey) {
        clearFieldError(t);
        state.pending[mod.module] = readValues(card);
        syncDirty(mod.module);
        Dash.refreshNav();
        updateDirtyBar();
      }
    });
    card.addEventListener("change", function () {
      state.pending[mod.module] = readValues(card);
      syncDirty(mod.module);
      Dash.refreshNav();
      updateDirtyBar();
    });
    var saveRow = document.createElement("div");
    saveRow.className = "form-actions";
    var save = document.createElement("button");
    save.type = "submit";
    save.className = "btn btn-primary btn-sm";
    save.textContent = "Salva modifiche";
    saveRow.appendChild(save);
    var hint = document.createElement("span");
    hint.className = "muted small";
    hint.textContent = "Le modifiche non salvate restano evidenziate anche cambiando modulo.";
    saveRow.appendChild(hint);
    card.appendChild(saveRow);
    box.appendChild(card);
    state.baseline[mod.module] = JSON.stringify(valuesInOrder(mod.module, cached));
    syncDirty(mod.module);
    updateDirtyBar();
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
    var spec = schemaOf(modName);
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

  function validateModule(modName, form) {
    var spec = schemaOf(modName);
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

  function validatePendingValues(modName, values) {
    var spec = schemaOf(modName);
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

  function modTitle(modName) {
    var spec = schemaOf(modName);
    return (spec && spec.title) || modName;
  }

  function saveModulesSaver() {
    if (state.activeModule) {
      var activeForm = formOf(state.activeModule);
      if (activeForm) {
        state.pending[state.activeModule] = readValues(activeForm);
        syncDirty(state.activeModule);
      }
    }
    var mods = Object.keys(state.dirtyModules);
    if (mods.length === 0) return Promise.resolve();
    for (var i = 0; i < mods.length; i++) {
      var candidate = mods[i];
      var body0 = valuesInOrder(candidate, state.pending[candidate]);
      var bad0 = validatePendingValues(candidate, body0);
      if (bad0) {
        var firstInvalid = candidate;
        Dash.focusModule(firstInvalid);
        var form = formOf(firstInvalid);
        if (form) {
          var bad = validateModule(firstInvalid, form);
          if (bad) {
            setFieldError(bad.ctl, bad.msg);
            try { bad.ctl.focus(); } catch (err) {}
            toast(bad.msg, "err");
            return Promise.reject(new Error(bad.msg));
          }
        }
        toast(bad0.msg, "err");
        return Promise.reject(new Error(bad0.msg));
      }
    }
    var chain = Promise.resolve();
    mods.forEach(function (m) {
      chain = chain.then(function () {
        var body = valuesInOrder(m, state.pending[m]);
        var modName = m;
        return Dash.putModule(modName, body).then(function () {
          state.modulesCache[modName] = body;
          state.baseline[modName] = JSON.stringify(body);
          delete state.pending[modName];
          delete state.dirtyModules[modName];
          updateDirtyBar();
          Dash.refreshNav();
        });
      });
    });
    return chain;
  }

  function discardModules() {
    state.pending = {};
    state.dirtyModules = {};
    Dash.renderModuleList();
    var cur = state.entry ? findEntry(state.entry) : null;
    if (cur && cur.kind === "form") renderActiveModule();
  }

  Dash.renderModuleList = renderModuleList;
  Dash.openEntry = openEntry;
  Dash.focusModule = focusModule;
  Dash.refreshNav = refreshNav;
  Dash.moduleEntries = moduleEntries;
  Dash.filteredEntries = filteredEntries;
  Dash.moduleStatus = moduleStatus;
  Dash.entryStatus = entryStatus;
  Dash.renderActiveModule = renderActiveModule;
  Dash.validatePendingValues = validatePendingValues;
  Dash.saveModulesSaver = saveModulesSaver;

  if (!Array.isArray(Dash.onSave)) Dash.onSave = [];
  if (!Array.isArray(Dash.onDiscard)) Dash.onDiscard = [];
  if (Dash.onSave.indexOf(saveModulesSaver) === -1) Dash.onSave.push(saveModulesSaver);
  if (Dash.onDiscard.indexOf(discardModules) === -1) Dash.onDiscard.push(discardModules);

  Dash.modulesReady = true;
  void modTitle;
})();
