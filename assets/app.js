
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

  function campState(id) {
    return state[id] || { status:"offen", notes:"", callback:"", price:"", calledAt:"" };
  }

  function persist() {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customCamps));
    render();
  }

  function setCampState(id, patch) {
    state[id] = { ...campState(id), ...patch };
    if (patch.status && patch.status !== "offen" && !state[id].calledAt) {
      state[id].calledAt = new Date().toISOString();
    }
    persist();
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

  function nextOpenCamp() {
    return camps
      .filter(c => campState(c.id).status === "offen")
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  }

  function renderSummary() {
    const statuses = camps.map(c => campState(c.id).status);
    const open = statuses.filter(s => s === "offen").length;
    const follow = statuses.filter(s => s === "rueckruf" || s === "warteliste").length;
    const reserved = statuses.filter(s => s === "reserviert").length;
    const called = statuses.filter(s => s !== "offen").length;
    const total = camps.length;

    document.getElementById("campSummary").innerHTML = `
      <div class="summary-card"><strong>${open}</strong><span>OFFEN</span></div>
      <div class="summary-card"><strong>${follow}</strong><span>NACHFASSEN</span></div>
      <div class="summary-card"><strong>${reserved}</strong><span>RESERVIERT</span></div>
    `;

    document.getElementById("openCount").textContent = open;
    document.getElementById("reservedCount").textContent = reserved;
    document.getElementById("callProgress").textContent = `${called} / ${total}`;
    document.getElementById("progressBar").style.width = total ? `${called / total * 100}%` : "0%";

    const next = nextOpenCamp();
    document.getElementById("nextCampName").textContent = next ? next.name : "Alle Plätze bearbeitet";
    document.getElementById("nextCampMeta").textContent = next
      ? `${next.region} · ${next.place}`
      : "Es gibt aktuell keinen offenen Eintrag.";
  }

  function renderCampList() {
    const statusFilter = document.getElementById("statusFilter").value;
    const filtered = camps
      .filter(c => activeRegion === "Alle" || c.region === activeRegion)
      .filter(c => statusFilter === "Alle" || campState(c.id).status === statusFilter)
      .sort((a, b) => {
        const order = { offen:0, "keine-antwort":1, rueckruf:2, warteliste:3, reserviert:4, ausgebucht:5 };
        return order[campState(a.id).status] - order[campState(b.id).status]
          || (b.priority || 0) - (a.priority || 0);
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
        <article class="camp-card" data-card="${escapeHtml(c.id)}">
          <div class="camp-top">
            <div>
              <div class="region">${escapeHtml(c.region)}</div>
              <h3>${escapeHtml(c.name)}</h3>
              <div class="place">${escapeHtml(c.place)}</div>
            </div>
            <span class="status-badge s-${escapeHtml(s.status)}">${escapeHtml(statusNames[s.status])}</span>
          </div>

          <div class="rating">🚴 ${stars(c.bike)} · 🏊 ${stars(c.water)} · 👦 ${stars(c.family)}</div>
          <p class="note">${escapeHtml(c.note)}</p>

          <div class="contact-grid">
            ${phoneButton}
            <a href="${escapeHtml(c.website)}" target="_blank" rel="noopener">🌐 Website</a>
            <a href="${escapeHtml(c.maps)}" target="_blank" rel="noopener">📍 Karte</a>
          </div>

          <select data-status="${escapeHtml(c.id)}">
            ${Object.entries(statusNames).map(([value, label]) =>
              `<option value="${value}" ${s.status === value ? "selected" : ""}>${label}</option>`
            ).join("")}
          </select>

          <div class="field-grid">
            <input type="datetime-local" value="${escapeHtml(s.callback)}" data-callback="${escapeHtml(c.id)}" title="Rückrufzeit">
            <input type="number" min="0" step="0.01" value="${escapeHtml(s.price)}" data-price="${escapeHtml(c.id)}" placeholder="Preis in €">
          </div>

          <textarea data-notes="${escapeHtml(c.id)}" placeholder="Gespräch, Ansprechpartner, Zeitraum und Bedingungen">${escapeHtml(s.notes)}</textarea>

          <div class="card-actions">
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
      el.addEventListener("change", () => setCampState(el.dataset.status, { status: el.value }));
    });
    document.querySelectorAll("[data-callback]").forEach(el => {
      el.addEventListener("change", () => setCampState(el.dataset.callback, { callback: el.value }));
    });
    document.querySelectorAll("[data-price]").forEach(el => {
      el.addEventListener("change", () => setCampState(el.dataset.price, { price: el.value }));
    });
    document.querySelectorAll("[data-notes]").forEach(el => {
      el.addEventListener("change", () => setCampState(el.dataset.notes, { notes: el.value }));
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
      phone,
      phoneDisplay: phone || "Telefon ergänzen",
      website: document.getElementById("campWebsite").value.trim() || "#",
      maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + place)}`,
      bike: 3, water: 3, family: 3, priority: 6,
      note: document.getElementById("campNote").value.trim(),
      custom: true
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
    document.getElementById("nextOpenBtn").addEventListener("click", () => {
      const next = nextOpenCamp();
      if (!next) return toast("Keine offenen Plätze");
      const card = document.querySelector(`[data-card="${CSS.escape(next.id)}"]`);
      card?.scrollIntoView({ behavior:"smooth", block:"center" });
      toast(next.name);
    });

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
