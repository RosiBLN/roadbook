(() => {
  "use strict";

  const KEY = "roadbook-v4-state";
  const CUSTOM_KEY = "roadbook-v4-custom";
  const THEME_KEY = "roadbook-v4-theme";

  const baseCamps = Array.isArray(window.ROADBOOK_CAMPSITES) ? window.ROADBOOK_CAMPSITES : [];
  let customCamps = safeParse(localStorage.getItem(CUSTOM_KEY), []);
  let state = safeParse(localStorage.getItem(KEY), {});
  let camps = [...baseCamps, ...customCamps];
  let activeRegion = "Alle";
  let currentCampId = null;
  let skippedThisSession = new Set();

  const statusNames = {
    offen: "Noch anrufen",
    "keine-antwort": "Keine Antwort",
    rueckruf: "Rückruf",
    warteliste: "Warteliste",
    reserviert: "Reserviert",
    ausgebucht: "Ausgebucht"
  };

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[c]);
  }

  function priorityLetter(camp) {
    if (camp.priorityLetter) return camp.priorityLetter;
    const score = Number(camp.priority || 0);
    return score >= 9 ? "A" : score >= 7 ? "B" : "C";
  }

  function priorityRank(camp) {
    return { A:3, B:2, C:1 }[priorityLetter(camp)] || 0;
  }

  function campState(id) {
    return state[id] || { status:"offen", notes:"", calledAt:"" };
  }

  function persist() {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCamps));
    render();
  }

  function setCampState(id, patch, advance = false) {
    state[id] = { ...campState(id), ...patch };
    if (patch.status && patch.status !== "offen" && !state[id].calledAt) {
      state[id].calledAt = new Date().toISOString();
    }
    localStorage.setItem(KEY, JSON.stringify(state));
    if (advance) {
      skippedThisSession.delete(id);
      currentCampId = null;
    }
    render();
  }

  function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 1200);
  }

  function stars(n = 3) {
    return "★".repeat(n) + "☆".repeat(5 - n);
  }

  function isFresh(camp) {
    return campState(camp.id).status === "offen";
  }

  function isRetry(camp) {
    const status = campState(camp.id).status;
    return status === "keine-antwort" || status === "rueckruf";
  }

  function isActive(camp) {
    return isFresh(camp) || isRetry(camp);
  }

  function sortedFreshCamps(includeSkipped = false) {
    return camps
      .filter(isFresh)
      .filter(c => includeSkipped || !skippedThisSession.has(c.id))
      .sort((a, b) =>
        priorityRank(b) - priorityRank(a) ||
        (b.priority || 0) - (a.priority || 0) ||
        a.name.localeCompare(b.name, "de")
      );
  }

  function sortedRetryCamps(includeSkipped = false) {
    return camps
      .filter(isRetry)
      .filter(c => includeSkipped || !skippedThisSession.has(c.id))
      .sort((a, b) => {
        const aTime = Date.parse(campState(a.id).calledAt || 0) || 0;
        const bTime = Date.parse(campState(b.id).calledAt || 0) || 0;
        return aTime - bTime ||
          priorityRank(b) - priorityRank(a) ||
          a.name.localeCompare(b.name, "de");
      });
  }

  function currentPhase() {
    return camps.some(isFresh) ? "fresh" : (camps.some(isRetry) ? "retry" : "done");
  }

  function phaseQueue(includeSkipped = false) {
    return currentPhase() === "fresh"
      ? sortedFreshCamps(includeSkipped)
      : sortedRetryCamps(includeSkipped);
  }

  function getCurrentCamp() {
    const phase = currentPhase();
    const current = camps.find(c => c.id === currentCampId && isActive(c));
    if (current) {
      const currentIsCorrectPhase =
        (phase === "fresh" && isFresh(current)) ||
        (phase === "retry" && isRetry(current));
      if (currentIsCorrectPhase && !skippedThisSession.has(current.id)) return current;
    }

    let next = phaseQueue(false)[0];
    if (!next && phaseQueue(true).length) {
      skippedThisSession.clear();
      next = phaseQueue(false)[0];
    }
    currentCampId = next?.id || null;
    return next || null;
  }

  function renderSummary() {
    const fresh = camps.filter(isFresh).length;
    const retry = camps.filter(isRetry).length;
    const reserved = camps.filter(c => campState(c.id).status === "reserviert").length;
    const terminal = camps.filter(c => {
      const s = campState(c.id).status;
      return s === "reserviert" || s === "ausgebucht" || s === "warteliste";
    }).length;
    const contacted = camps.length - fresh;
    const total = camps.length;

    document.getElementById("campSummary").innerHTML = `
      <div class="summary-card"><strong>${fresh}</strong><span>NEUE ANRUFE</span></div>
      <div class="summary-card"><strong>${retry}</strong><span>RÜCKRUFE</span></div>
      <div class="summary-card"><strong>${reserved}</strong><span>RESERVIERT</span></div>
    `;

    document.getElementById("openCount").textContent = fresh + retry;
    document.getElementById("reservedCount").textContent = reserved;
    document.getElementById("callProgress").textContent = `${contacted} / ${total}`;
    document.getElementById("progressBar").style.width = total ? `${contacted / total * 100}%` : "0%";

    const next = getCurrentCamp();
    const phase = currentPhase();
    document.getElementById("nextCampName").textContent = next ? next.name : "Alle Plätze bearbeitet";
    document.getElementById("nextCampMeta").textContent = next
      ? `${phase === "fresh" ? "Erstanruf" : "Rückrufrunde"} · ${next.region} · ${next.place} · Priorität ${priorityLetter(next)}`
      : "Es gibt aktuell keinen offenen Eintrag.";
  }

  function renderCockpit() {
    const camp = getCurrentCamp();
    const cockpit = document.getElementById("callCockpit");

    if (!camp) {
      cockpit.innerHTML = `
        <div class="cockpit-empty">
          <div class="success-mark">✓</div>
          <h2>Alle Plätze bearbeitet</h2>
          <p>Du kannst in der Übersicht einen Status wieder auf „Noch anrufen“ setzen.</p>
        </div>`;
      return;
    }

    const s = campState(camp.id);
    const phase = currentPhase();
    const queue = phaseQueue(true);
    const queueIndex = Math.max(0, queue.findIndex(c => c.id === camp.id));
    const phaseLabel = phase === "fresh" ? "NÄCHSTER ERSTANRUF" : "RÜCKRUFRUNDE";
    const phaseHint = phase === "fresh"
      ? "Zuerst werden alle noch unversuchten Plätze angerufen."
      : "Jetzt erscheinen die nicht erreichten Plätze erneut.";
    const phoneAction = camp.phone
      ? `<a class="cockpit-call" href="tel:${escapeHtml(camp.phone)}">☎ Jetzt anrufen</a>`
      : `<button class="cockpit-call missing" data-edit="${escapeHtml(camp.id)}">☎ Telefonnummer ergänzen</button>`;

    cockpit.innerHTML = `
      <div class="cockpit-head">
        <div>
          <span class="eyebrow">${phaseLabel}</span>
          <div class="priority priority-${priorityLetter(camp).toLowerCase()}">Priorität ${priorityLetter(camp)}</div>
          <h2>${escapeHtml(camp.name)}</h2>
          <p>${escapeHtml(camp.place)} · ${escapeHtml(camp.region)}</p>
        </div>
        <div class="camp-number">${queueIndex + 1}<small>von ${queue.length}</small></div>
      </div>

      <p class="phase-hint">${phaseHint}</p>

      <div class="cockpit-rating">
        <span>🚴 ${stars(camp.bike)}</span>
        <span>🏊 ${stars(camp.water)}</span>
        <span>👨‍👦 ${stars(camp.family)}</span>
      </div>

      <p class="note">${escapeHtml(camp.note)}</p>

      <div class="cockpit-links">
        ${phoneAction}
        <a href="${escapeHtml(camp.website)}" target="_blank" rel="noopener">🌐 Website</a>
        <a href="${escapeHtml(camp.maps)}" target="_blank" rel="noopener">📍 Karte</a>
      </div>

      <label class="quick-note-label">Kurze Notiz
        <textarea id="quickNote" placeholder="Zum Beispiel: Vielleicht ab Mittwoch">${escapeHtml(s.notes)}</textarea>
      </label>

      <div class="result-title">Ergebnis des Anrufs</div>
      <div class="result-grid">
        <button class="result reserved" data-result="reserviert">✓ Reserviert</button>
        <button class="result full" data-result="ausgebucht">× Ausgebucht</button>
        <button class="result callback" data-result="rueckruf">↻ Erneut anrufen</button>
        <button class="result wait" data-result="warteliste">≋ Warteliste</button>
        <button class="result noanswer" data-result="keine-antwort">… Nicht erreicht</button>
        <button class="result skip" id="skipCamp">→ Später</button>
      </div>
    `;

    document.getElementById("quickNote")?.addEventListener("change", e => {
      setCampState(camp.id, { notes:e.target.value });
    });

    cockpit.querySelectorAll("[data-result]").forEach(btn => {
      btn.addEventListener("click", () => {
        const note = document.getElementById("quickNote")?.value || "";
        const result = btn.dataset.result;
        const label = statusNames[result];
        state[camp.id] = { ...campState(camp.id), status:result, notes:note, calledAt:new Date().toISOString() };
        localStorage.setItem(KEY, JSON.stringify(state));
        currentCampId = null;
        skippedThisSession.delete(camp.id);
        render();
        const remainsActive = result === "keine-antwort" || result === "rueckruf";
        toast(remainsActive ? `${label} – kommt später wieder` : `${label} – nächster Platz`);
      });
    });

    document.getElementById("skipCamp")?.addEventListener("click", () => {
      skippedThisSession.add(camp.id);
      currentCampId = null;
      render();
      toast("Für später übersprungen");
    });

    cockpit.querySelectorAll("[data-edit]").forEach(el => {
      el.addEventListener("click", () => openCampDialog(camp));
    });
  }

  function renderCampList() {
    const statusFilter = document.getElementById("statusFilter").value;
    const filtered = camps
      .filter(c => activeRegion === "Alle" || c.region === activeRegion)
      .filter(c => statusFilter === "Alle" || campState(c.id).status === statusFilter)
      .sort((a, b) => {
        const order = { offen:0, "keine-antwort":1, rueckruf:2, warteliste:3, reserviert:4, ausgebucht:5 };
        return order[campState(a.id).status] - order[campState(b.id).status]
          || priorityRank(b) - priorityRank(a)
          || a.name.localeCompare(b.name, "de");
      });

    const list = document.getElementById("campList");
    if (!filtered.length) {
      list.innerHTML = `<article class="panel"><p class="muted">Keine passenden Campingplätze.</p></article>`;
      return;
    }

    list.innerHTML = filtered.map(c => {
      const s = campState(c.id);
      const phoneButton = c.phone
        ? `<a class="call" href="tel:${escapeHtml(c.phone)}">☎ Anrufen</a>`
        : `<button data-edit="${escapeHtml(c.id)}">☎ Ergänzen</button>`;

      return `
        <article class="camp-card compact" data-card="${escapeHtml(c.id)}">
          <div class="camp-top">
            <div>
              <div class="camp-label-row">
                <span class="region">${escapeHtml(c.region)}</span>
                <span class="priority-mini priority-${priorityLetter(c).toLowerCase()}">${priorityLetter(c)}</span>
              </div>
              <h3>${escapeHtml(c.name)}</h3>
              <div class="place">${escapeHtml(c.place)}</div>
            </div>
            <span class="status-badge s-${escapeHtml(s.status)}">${escapeHtml(statusNames[s.status])}</span>
          </div>

          ${s.notes ? `<p class="saved-note">📝 ${escapeHtml(s.notes)}</p>` : ""}

          <div class="contact-grid compact-actions">
            ${phoneButton}
            <a href="${escapeHtml(c.website)}" target="_blank" rel="noopener">🌐 Website</a>
            <a href="${escapeHtml(c.maps)}" target="_blank" rel="noopener">📍 Karte</a>
          </div>

          <select data-status="${escapeHtml(c.id)}">
            ${Object.entries(statusNames).map(([value, label]) =>
              `<option value="${value}" ${s.status === value ? "selected" : ""}>${label}</option>`
            ).join("")}
          </select>

          <textarea data-notes="${escapeHtml(c.id)}" placeholder="Kurze Notiz">${escapeHtml(s.notes)}</textarea>

          <div class="card-actions">
            ${isActive(c) ? `<button data-focus="${escapeHtml(c.id)}">Als Nächstes</button>` : ""}
            <button data-edit="${escapeHtml(c.id)}">Bearbeiten</button>
            ${c.custom ? `<button data-delete="${escapeHtml(c.id)}">Löschen</button>` : ""}
          </div>
        </article>
      `;
    }).join("");

    bindCampControls();
  }

  function bindCampControls() {
    document.querySelectorAll("[data-status]").forEach(el => {
      el.addEventListener("change", () => setCampState(el.dataset.status, { status:el.value }));
    });
    document.querySelectorAll("[data-notes]").forEach(el => {
      el.addEventListener("change", () => setCampState(el.dataset.notes, { notes:el.value }));
    });
    document.querySelectorAll("[data-focus]").forEach(el => {
      el.addEventListener("click", () => {
        skippedThisSession.delete(el.dataset.focus);
        currentCampId = el.dataset.focus;
        render();
        document.getElementById("callCockpit").scrollIntoView({ behavior:"smooth", block:"start" });
      });
    });
    document.querySelectorAll("[data-edit]").forEach(el => {
      el.addEventListener("click", () => openCampDialog(camps.find(c => c.id === el.dataset.edit)));
    });
    document.querySelectorAll("[data-delete]").forEach(el => {
      el.addEventListener("click", () => {
        if (!confirm("Diesen eigenen Campingplatz löschen?")) return;
        customCamps = customCamps.filter(c => c.id !== el.dataset.delete);
        delete state[el.dataset.delete];
        persist();
      });
    });
  }

  function render() {
    camps = [...baseCamps, ...customCamps];
    renderSummary();
    renderCockpit();
    renderCampList();
  }

  function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === id));
    document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.page === id));
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function openCampDialog(camp = null) {
    document.getElementById("campId").value = camp?.id || "";
    document.getElementById("campName").value = camp?.name || "";
    document.getElementById("campRegion").value = camp?.region || "Soča-Tal";
    document.getElementById("campPlace").value = camp?.place || "";
    document.getElementById("campPriority").value = camp ? priorityLetter(camp) : "B";
    document.getElementById("campPhone").value = camp?.phoneDisplay === "Telefon ergänzen" ? "" : (camp?.phoneDisplay || "");
    document.getElementById("campWebsite").value = camp?.website || "";
    document.getElementById("campNote").value = camp?.note || "";
    document.getElementById("campDialog").showModal();
  }

  function saveCampFromDialog(event) {
    event.preventDefault();
    const id = document.getElementById("campId").value;
    const name = document.getElementById("campName").value.trim();
    if (!name) return;

    const phone = document.getElementById("campPhone").value.trim();
    const place = document.getElementById("campPlace").value.trim();

    const item = {
      id: id || `custom-${Date.now()}`,
      name,
      region: document.getElementById("campRegion").value,
      place,
      priorityLetter: document.getElementById("campPriority").value,
      priority: { A:10, B:8, C:5 }[document.getElementById("campPriority").value],
      phone,
      phoneDisplay: phone || "Telefon ergänzen",
      website: document.getElementById("campWebsite").value.trim() || "#",
      maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + place)}`,
      bike:3, water:3, family:3,
      note: document.getElementById("campNote").value.trim(),
      custom:true
    };

    const existingCustom = customCamps.findIndex(c => c.id === item.id);
    if (existingCustom >= 0) {
      customCamps[existingCustom] = item;
    } else {
      const base = baseCamps.find(c => c.id === item.id);
      if (base) {
        item.id = `custom-${Date.now()}`;
        customCamps.push(item);
      } else {
        customCamps.push(item);
      }
    }

    document.getElementById("campDialog").close();
    persist();
    toast("Campingplatz gespeichert");
  }

  function exportData() {
    const data = JSON.stringify({ state, customCamps }, null, 2);
    const blob = new Blob([data], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "roadbook-v4-sicherung.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file) {
    try {
      const parsed = JSON.parse(await file.text());
      state = parsed.state || {};
      customCamps = parsed.customCamps || [];
      persist();
      toast("Sicherung importiert");
    } catch {
      alert("Die Datei konnte nicht importiert werden.");
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") document.documentElement.classList.add("dark");
    document.getElementById("themeToggle").addEventListener("click", () => {
      document.documentElement.classList.toggle("dark");
      localStorage.setItem(THEME_KEY, document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
  }

  function initChecklist() {
    document.querySelectorAll("[data-persist]").forEach(el => {
      const key = `_check_${el.dataset.persist}`;
      el.checked = !!state[key];
      el.addEventListener("change", () => {
        state[key] = el.checked;
        persist();
      });
    });
  }

  function initCountdown() {
    const days = Math.ceil((new Date("2026-08-08T08:00:00") - new Date()) / 86400000);
    document.getElementById("countdown").textContent = days > 0 ? `${days} Tage` : "Los geht’s";
  }

  function initEvents() {
    document.querySelectorAll(".bottom-nav button").forEach(btn => {
      btn.addEventListener("click", () => showPage(btn.dataset.page));
    });
    document.querySelectorAll("[data-go]").forEach(btn => {
      btn.addEventListener("click", () => showPage(btn.dataset.go));
    });

    document.querySelectorAll("#regionFilter button").forEach(btn => {
      btn.addEventListener("click", () => {
        activeRegion = btn.dataset.region;
        document.querySelectorAll("#regionFilter button").forEach(x => x.classList.toggle("active", x === btn));
        renderCampList();
      });
    });

    document.getElementById("statusFilter").addEventListener("change", renderCampList);
    document.getElementById("addCampBtn").addEventListener("click", () => openCampDialog());
    document.getElementById("saveCampBtn").addEventListener("click", saveCampFromDialog);
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importFile").addEventListener("change", e => e.target.files[0] && importData(e.target.files[0]));
    document.getElementById("resetBtn").addEventListener("click", () => {
      if (!confirm("Alle lokalen Status, Notizen und eigenen Plätze löschen?")) return;
      localStorage.removeItem(KEY);
      localStorage.removeItem(CUSTOM_KEY);
      location.reload();
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }

  initTheme();
  initChecklist();
  initCountdown();
  initEvents();
  render();
  registerServiceWorker();
})();