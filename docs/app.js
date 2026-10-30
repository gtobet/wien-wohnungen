"use strict";

const DEFAULTS = {
  maxPrice: 850,
  minArea: 50,
  minRooms: 2,
  districts: [2, 3, 4, 5, 6, 7, 8, 12, 14, 15, 16, 20],
  outdoorOnly: false,
  hideReserved: true,
  hideSwap: true,
  includeUnknown: false,
  showHidden: false,
  favOnly: false,
  platforms: null, // null = alle
  sort: "new",
};
const PAGE_SIZE = 48;
const REPO = (() => {
  const owner = location.hostname.endsWith(".github.io") ? location.hostname.split(".")[0] : "gtobet";
  const repo = location.hostname.endsWith(".github.io") ? location.pathname.split("/")[1] || "wien-wohnungen" : "wien-wohnungen";
  return `${owner}/${repo}`;
})();
const WORKFLOW = "update.yml";

const DISTRICT_NAMES = {
  1: "Innere Stadt", 2: "Leopoldstadt", 3: "Landstraße", 4: "Wieden", 5: "Margareten",
  6: "Mariahilf", 7: "Neubau", 8: "Josefstadt", 9: "Alsergrund", 10: "Favoriten",
  11: "Simmering", 12: "Meidling", 13: "Hietzing", 14: "Penzing", 15: "Rudolfsheim-Fünfhaus",
  16: "Ottakring", 17: "Hernals", 18: "Währing", 19: "Döbling", 20: "Brigittenau",
  21: "Floridsdorf", 22: "Donaustadt", 23: "Liesing",
};
// Ungefähre Bezirksmitten, falls die Bezirksgrenzen nicht geladen werden können.
const DISTRICT_CENTERS = {
  1: [48.2085, 16.3721], 2: [48.2185, 16.4], 3: [48.1986, 16.3948], 4: [48.1925, 16.3696],
  5: [48.1872, 16.3561], 6: [48.196, 16.3495], 7: [48.2025, 16.3489], 8: [48.2109, 16.3474],
  9: [48.2253, 16.3561], 10: [48.158, 16.38], 11: [48.17, 16.44], 12: [48.176, 16.326],
  13: [48.172, 16.255], 14: [48.205, 16.265], 15: [48.195, 16.325], 16: [48.213, 16.308],
  17: [48.227, 16.295], 18: [48.23, 16.33], 19: [48.255, 16.335], 20: [48.237, 16.373],
  21: [48.277, 16.41], 22: [48.23, 16.49], 23: [48.14, 16.29],
};

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
};

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* privater Modus o. ä. – dann eben ohne Speichern */
    }
  },
};

let data = { listings: [], status: {}, updated: null };
let state = { ...DEFAULTS, ...store.get("filters", {}) };
let shown = PAGE_SIZE;
let visibleItems = [];
let hoverTimer = null;
const HIGHLIGHT = "#e8590c";
const favs = new Set(store.get("favs", []));
const hidden = new Set(store.get("hidden", []));
const previousVisit = store.get("lastVisit", null);
store.set("lastVisit", new Date().toISOString());

const $ = (id) => document.getElementById(id);
const form = $("filters");
const sortSelect = document.querySelector('select[name="sort"]');
const fmtEuro = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 1 });
const fmtSqm = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "numeric" });

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function cleanTitle(t) {
  return String(t || "Ohne Titel").replace(/_+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function isNew(item) {
  const since = previousVisit ? new Date(previousVisit) : new Date(Date.now() - 24 * 3600e3);
  return new Date(item.first_seen) > since;
}

function allPlatforms() {
  return Object.keys(data.status || {});
}

/* ---------- Filter ---------- */

function chip(label, pressed, onClick, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = label;
  if (title) b.title = title;
  b.setAttribute("aria-pressed", pressed());
  b.addEventListener("click", () => {
    onClick();
    b.setAttribute("aria-pressed", pressed());
    changed();
  });
  return b;
}

function buildChips() {
  const d = $("districts");
  d.replaceChildren();
  for (let n = 1; n <= 23; n++) {
    d.append(
      chip(
        n,
        () => state.districts.includes(n),
        () => {
          state.districts = state.districts.includes(n) ? state.districts.filter((x) => x !== n) : [...state.districts, n];
        },
        `${n}. ${DISTRICT_NAMES[n]}`
      )
    );
  }

  const p = $("platforms");
  p.replaceChildren();
  for (const name of allPlatforms()) {
    const on = () => !state.platforms || state.platforms.includes(name);
    p.append(
      chip(name, on, () => {
        const current = state.platforms || allPlatforms();
        state.platforms = on() ? current.filter((x) => x !== name) : [...current, name];
      })
    );
  }
}

function syncForm() {
  for (const el of [...form.elements, sortSelect]) {
    if (!el.name || !(el.name in state)) continue;
    if (el.type === "checkbox") el.checked = !!state[el.name];
    else el.value = state[el.name] ?? "";
  }
}

function readForm() {
  for (const el of [...form.elements, sortSelect]) {
    if (!el.name || !(el.name in DEFAULTS)) continue;
    if (el.type === "checkbox") state[el.name] = el.checked;
    else if (el.type === "number") state[el.name] = el.value === "" ? null : Number(el.value);
    else state[el.name] = el.value;
  }
}

function matches(x) {
  if (!state.showHidden && hidden.has(x.id)) return false;
  if (state.favOnly && !favs.has(x.id)) return false;
  if (state.platforms && !state.platforms.includes(x.platform)) return false;
  if (state.hideSwap && x.swap) return false;
  if (state.hideReserved && x.reserved) return false;
  if (state.outdoorOnly && !(x.outdoor && x.outdoor.length)) return false;
  if (x.district == null || !state.districts.includes(x.district)) return false;
  const check = (value, ok) => (value == null ? state.includeUnknown : ok(value));
  if (state.maxPrice != null && !check(x.price, (v) => v <= state.maxPrice)) return false;
  if (state.minArea != null && !check(x.area, (v) => v >= state.minArea)) return false;
  if (state.minRooms != null && !check(x.rooms, (v) => v >= state.minRooms)) return false;
  return true;
}

const SORTS = {
  new: (a, b) => (b.first_seen || "").localeCompare(a.first_seen || "") || (b.published || "").localeCompare(a.published || ""),
  price: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9),
  sqm: (a, b) => (a.price && a.area ? a.price / a.area : 1e9) - (b.price && b.area ? b.price / b.area : 1e9),
  area: (a, b) => (b.area ?? 0) - (a.area ?? 0),
};

/* ---------- Karten (Listing) ---------- */

function gallery(x) {
  const images = (x.images && x.images.length ? x.images : x.image ? [x.image] : []).filter(Boolean);
  const wrap = document.createElement("div");
  wrap.className = "gallery";
  if (!images.length) {
    wrap.innerHTML = '<div class="empty">Kein Foto</div>';
    return wrap;
  }
  const slides = document.createElement("div");
  slides.className = "slides";
  images.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = i === 0 ? "eager" : "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove(), { once: true });
    slides.append(img);
  });
  wrap.append(slides);
  if (images.length < 2) return wrap;

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "nav prev";
  prev.setAttribute("aria-label", "Vorheriges Foto");
  prev.innerHTML = ICONS.prev;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "nav next";
  next.setAttribute("aria-label", "Nächstes Foto");
  next.innerHTML = ICONS.next;
  const counter = document.createElement("span");
  counter.className = "counter";
  wrap.append(prev, next, counter);

  const update = () => {
    const total = slides.children.length;
    const i = Math.round(slides.scrollLeft / Math.max(slides.clientWidth, 1));
    counter.textContent = `${Math.min(i + 1, total)} / ${total}`;
    prev.disabled = i <= 0;
    next.disabled = i >= total - 1;
  };
  const go = (dir) => slides.scrollBy({ left: dir * slides.clientWidth, behavior: "smooth" });
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  slides.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  wrap.tabIndex = 0;
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
  requestAnimationFrame(update);
  return wrap;
}

function card(x) {
  const li = document.createElement("li");
  li.className = "card" + (hidden.has(x.id) ? " is-hidden" : "") + (x.reserved ? " is-reserved" : "");
  li.dataset.id = x.id;

  const g = gallery(x);
  const tags = document.createElement("div");
  tags.className = "overlay-tags";
  tags.innerHTML =
    (isNew(x) ? '<span class="badge new">Neu</span>' : "") + (x.reserved ? '<span class="badge reserved">Reserviert</span>' : "");
  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "fav";
  fav.setAttribute("aria-label", "Merken");
  fav.setAttribute("aria-pressed", favs.has(x.id));
  fav.innerHTML = ICONS.heart;
  fav.addEventListener("click", () => toggle(favs, "favs", x.id, fav));
  g.append(tags, fav);

  const body = document.createElement("div");
  body.className = "body";
  const sqm = x.price && x.area ? `<span class="sqm">${fmtSqm.format(x.price / x.area)} €/m²</span>` : "";
  const facts = [
    x.area != null ? `${fmtNum.format(x.area)} m²` : "",
    x.rooms != null ? `${fmtNum.format(x.rooms)} Zimmer` : "",
    x.district ? `${x.district}., ${DISTRICT_NAMES[x.district]}` : "",
  ].filter(Boolean);
  body.innerHTML = `
    <div class="price-row">
      <span class="price" title="${esc(x.price_note)}">${x.price != null ? fmtEuro.format(x.price) : "Preis auf Anfrage"}</span>
      ${sqm}
    </div>
    <div class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</div>
    ${x.outdoor && x.outdoor.length ? `<div class="outdoor">Mit ${esc(x.outdoor.join(", "))}</div>` : ""}
    <p class="title">${esc(cleanTitle(x.title))}</p>
    <div class="foot">
      <span>${esc(x.platform)} · seit ${fmtDay.format(new Date(x.first_seen))}${x.swap ? " · Tausch" : ""}</span>
      <span class="spacer"></span>
      <button type="button" class="ghost" data-act="hide">${hidden.has(x.id) ? "Einblenden" : "Ausblenden"}</button>
      <a class="open" href="${esc(x.url)}" target="_blank" rel="noopener">Ansehen ${ICONS.external}</a>
    </div>`;
  body.querySelector('[data-act="hide"]').addEventListener("click", (e) => {
    toggle(hidden, "hidden", x.id, e.currentTarget);
    render();
  });

  li.addEventListener("mouseenter", () => {
    // Short delay so sweeping the mouse over several cards does not start a fly animation for each.
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => focusListing(x), 120);
  });
  li.append(g, body);
  return li;
}

function toggle(set, key, id, button) {
  set.has(id) ? set.delete(id) : set.add(id);
  store.set(key, [...set]);
  button.setAttribute("aria-pressed", set.has(id));
}

function summary() {
  const parts = [];
  if (state.maxPrice != null) parts.push(`bis ${fmtEuro.format(state.maxPrice)}`);
  if (state.minArea != null) parts.push(`ab ${state.minArea} m²`);
  if (state.minRooms != null) parts.push(`ab ${state.minRooms} Zi.`);
  parts.push(`${state.districts.length} Bezirke`);
  if (state.outdoorOnly) parts.push("Freifläche");
  return parts.join(" · ");
}

function render() {
  const items = data.listings.filter(matches).sort(SORTS[state.sort] || SORTS.new);
  visibleItems = items;
  const fresh = items.filter(isNew).length;
  const reservedHidden = state.hideReserved ? data.listings.filter((x) => x.reserved && matches({ ...x, reserved: false })).length : 0;
  $("count").innerHTML =
    `${items.length} ${items.length === 1 ? "Wohnung" : "Wohnungen"}` +
    (fresh ? `<small>${fresh} neu</small>` : "") +
    (reservedHidden ? `<small>${reservedHidden} reservierte ausgeblendet</small>` : "");
  $("filterSummary").textContent = summary();
  const list = $("list");
  if (!items.length) {
    list.innerHTML = '<li class="empty-state">Keine Wohnungen für diese Filter. Probier etwas mehr Spielraum bei Preis oder Bezirken.</li>';
  } else {
    list.replaceChildren(...items.slice(0, shown).map(card));
  }
  const more = $("more");
  more.hidden = items.length <= shown;
  more.textContent = `Weitere ${Math.min(PAGE_SIZE, items.length - shown)} von ${items.length - shown} anzeigen`;
  mapView.refresh();
  observeCards();
}

function renderMeta() {
  $("meta").textContent = data.updated ? `Aktualisiert ${fmtDate.format(new Date(data.updated))}` : "Noch keine Daten";
  $("sources").innerHTML = Object.entries(data.status || {})
    .map(([name, s]) =>
      s.ok
        ? `<span class="source" title="${s.count} Angebote im Suchraum">${esc(name)}</span>`
        : `<span class="source bad" title="${esc(s.error)}">${esc(name)} nicht erreichbar</span>`
    )
    .join("");
}

function changed() {
  store.set("filters", state);
  shown = PAGE_SIZE;
  render();
}

/* ---------- Karte ---------- */

const mapView = {
  map: null,
  pins: null,
  highlight: null,
  districts: null,
  districtLayer: null,
  active: null,

  enabled() {
    return $("mapToggle").checked && typeof L !== "undefined";
  },

  init() {
    if (this.map || typeof L === "undefined") return;
    this.map = L.map("map", { zoomControl: true, scrollWheelZoom: true, attributionControl: true }).setView([48.2082, 16.3738], 12);
    // OpenStreetMap-Standardkacheln brauchen keinen Schlüssel; Graustufen kommen per CSS-Filter.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    this.pins = L.layerGroup().addTo(this.map);
    this.highlight = L.layerGroup().addTo(this.map);
    this.addShadowControl();
    fetch("data/bezirke.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((geo) => {
        if (!geo) return;
        this.districts = geo;
        this.refresh();
      })
      .catch(() => {});
  },

  icon(cls) {
    return L.divIcon({ className: "", html: `<div class="pin ${cls}"></div>`, iconSize: null });
  },

  refresh() {
    if (!this.enabled()) return;
    this.init();
    this.map.invalidateSize();
    this.pins.clearLayers();
    if (this.districtLayer) this.districtLayer.remove();
    if (this.districts) {
      const line = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#888";
      this.districtLayer = L.geoJSON(this.districts, {
        style: (f) => {
          const on = state.districts.includes(f.properties.nr);
          return { color: on ? "#1c7ed6" : line, weight: on ? 1.5 : 0.6, opacity: on ? 0.7 : 0.4, fill: on, fillColor: "#1c7ed6", fillOpacity: 0.04 };
        },
        interactive: false,
      }).addTo(this.map);
    }
    for (const x of visibleItems) {
      if (!x.geo || !x.geo.exact) continue;
      const m = L.marker([x.geo.lat, x.geo.lon], { icon: this.icon("dim"), keyboard: false });
      m.on("click", () => {
        const el = document.querySelector(`.card[data-id="${CSS.escape(x.id)}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        this.show(x);
      });
      this.pins.addLayer(m);
    }
    if (this.active) this.show(this.active, false);
  },

  show(x, pan = true) {
    this.active = x;
    if (!this.enabled()) return;
    this.init();
    this.highlight.clearLayers();
    let bounds = null;
    let label = "";
    if (x.geo && x.geo.exact) {
      const ll = [x.geo.lat, x.geo.lon];
      L.marker(ll, { icon: this.icon("big"), interactive: false, zIndexOffset: 1000 }).addTo(this.highlight);
      bounds = L.latLng(ll).toBounds(400);
      label = "Genaue Lage laut Inserat";
    } else if (x.geo && x.geo.radius) {
      const c = L.circle([x.geo.lat, x.geo.lon], { radius: x.geo.radius, color: HIGHLIGHT, weight: 2, fillColor: HIGHLIGHT, fillOpacity: 0.2 }).addTo(this.highlight);
      bounds = c.getBounds();
      label = "Ungefähre Lage laut Inserat";
    } else if (x.district) {
      const f = this.districts && this.districts.features.find((f) => f.properties.nr === x.district);
      if (f) {
        const layer = L.geoJSON(f, { style: { color: HIGHLIGHT, weight: 2.5, fillColor: HIGHLIGHT, fillOpacity: 0.22 } }).addTo(this.highlight);
        bounds = layer.getBounds();
      } else {
        const c = L.circle(DISTRICT_CENTERS[x.district], { radius: 900, color: HIGHLIGHT, weight: 2, fillColor: HIGHLIGHT, fillOpacity: 0.2 }).addTo(this.highlight);
        bounds = c.getBounds();
      }
      label = `Nur Bezirk bekannt: ${x.district}., ${DISTRICT_NAMES[x.district]}`;
    }
    $("mapHint").textContent = label || "Keine Ortsangabe";
    this.updateShadowLink();
    if (pan && bounds) {
      // Always move: previously the map only moved when the target was off-screen,
      // so a listing inside a zoomed-out view looked like it was ignored.
      this.map.stop();
      this.map.flyToBounds(bounds, { maxZoom: x.geo && x.geo.exact ? 16 : 14, duration: 0.5, padding: [30, 30] });
    }
  },

  shadowLink: null,

  addShadowControl() {
    const Control = L.Control.extend({
      options: { position: "topright" },
      onAdd: () => {
        const a = L.DomUtil.create("a", "map-btn");
        a.target = "_blank";
        a.rel = "noopener";
        a.title = "Sonne und Schatten an dieser Stelle in Shadowmap ansehen";
        a.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg> Shadowmap';
        L.DomEvent.disableClickPropagation(a);
        a.addEventListener("click", () => this.updateShadowLink());
        this.shadowLink = a;
        return a;
      },
    });
    new Control().addTo(this.map);
    this.map.on("moveend", () => this.updateShadowLink());
    this.updateShadowLink();
  },

  updateShadowLink() {
    if (!this.shadowLink || !this.map) return;
    const x = this.active;
    const exact = x && x.geo && x.geo.exact;
    const c = exact ? L.latLng(x.geo.lat, x.geo.lon) : this.map.getCenter();
    const zoom = exact ? 18 : Math.max(this.map.getZoom(), 15);
    this.shadowLink.href = `https://app.shadowmap.org/?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}&zoom=${zoom}&time=${Date.now()}`;
  },
};

function focusListing(x) {
  document.querySelectorAll(".card.active").forEach((el) => el.classList.remove("active"));
  const el = document.querySelector(`.card[data-id="${CSS.escape(x.id)}"]`);
  if (el) el.classList.add("active");
  mapView.show(x);
}

// Auf Touch-Geräten gibt es kein Hover: dort zeigt die Karte das Angebot, das gerade oben im Bild ist.
let cardObserver = null;
function observeCards() {
  if (cardObserver) cardObserver.disconnect();
  if (matchMedia("(hover: hover)").matches || !mapView.enabled()) return;
  const byId = new Map(visibleItems.map((x) => [x.id, x]));
  cardObserver = new IntersectionObserver(
    (entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit && byId.has(hit.target.dataset.id)) focusListing(byId.get(hit.target.dataset.id));
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  document.querySelectorAll(".card").forEach((el) => cardObserver.observe(el));
}

function setMap(on) {
  $("mapToggle").checked = on;
  store.set("showMap", on);
  $("mapPane").hidden = !on;
  $("layout").classList.toggle("with-map", on);
  if (on) {
    requestAnimationFrame(() => mapView.refresh());
  }
  observeCards();
}

/* ---------- Aktualisieren ---------- */

const refresher = {
  timer: null,

  status(text) {
    const el = $("refreshStatus");
    el.hidden = !text;
    el.textContent = text || "";
    syncTopHeight();
  },

  busy(on) {
    const b = $("refresh");
    b.disabled = on;
    b.classList.toggle("spinning", on);
  },

  async api(path, opts = {}) {
    const token = store.get("ghToken", null);
    return fetch(`https://api.github.com/repos/${REPO}${path}`, {
      ...opts,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
    });
  },

  async start() {
    if (!store.get("ghToken", null)) {
      $("actionsLink").href = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;
      $("tokenDialog").showModal();
      return;
    }
    this.busy(true);
    this.status("Suche wird gestartet …");
    const started = Date.now();
    try {
      const r = await this.api(`/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        store.set("ghToken", null);
        throw new Error("Der GitHub-Schlüssel wurde abgelehnt. Bitte neu einrichten.");
      }
      if (!r.ok) throw new Error(`GitHub antwortet mit Fehler ${r.status}.`);
    } catch (e) {
      this.busy(false);
      this.status(e.message || "Suche konnte nicht gestartet werden.");
      return;
    }
    this.status("Alle Plattformen werden durchsucht. Das dauert etwa 3 bis 4 Minuten, du kannst die Seite offen lassen.");
    this.poll(started);
  },

  poll(started) {
    clearTimeout(this.timer);
    const tick = async () => {
      const elapsed = Date.now() - started;
      try {
        const runs = await this.api(`/actions/workflows/${WORKFLOW}/runs?per_page=1&event=workflow_dispatch`).then((r) => (r.ok ? r.json() : null));
        const run = runs && runs.workflow_runs && runs.workflow_runs[0];
        if (run && new Date(run.created_at).getTime() > started - 60e3 && run.status === "completed" && run.conclusion !== "success") {
          this.busy(false);
          this.status(`Die Suche ist auf GitHub fehlgeschlagen (${run.conclusion}). Details: github.com/${REPO}/actions`);
          return;
        }
        const fresh = await loadData();
        if (fresh && new Date(data.updated).getTime() > started - 60e3) {
          this.busy(false);
          this.status(`Fertig: Daten von ${fmtDate.format(new Date(data.updated))} geladen.`);
          setTimeout(() => this.status(""), 8000);
          return;
        }
      } catch {
        /* nächster Versuch */
      }
      if (elapsed > 12 * 60e3) {
        this.busy(false);
        this.status("Das dauert ungewöhnlich lange. Lade die Seite in ein paar Minuten neu.");
        return;
      }
      const mins = Math.floor(elapsed / 60e3);
      this.status(`Alle Plattformen werden durchsucht … (${mins > 0 ? `${mins} min` : "gerade gestartet"}). Neue Daten erscheinen automatisch.`);
      this.timer = setTimeout(tick, 20e3);
    };
    this.timer = setTimeout(tick, 30e3);
  },
};

/* ---------- Laden & Events ---------- */

async function loadData() {
  // Der Zeitstempel umgeht den Zwischenspeicher von GitHub Pages.
  const r = await fetch(`data/listings.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  const json = await r.json();
  const changedData = json.updated !== data.updated;
  data = json;
  if (changedData) {
    renderMeta();
    buildChips();
    render();
  }
  return changedData;
}

function syncTopHeight() {
  const h = document.querySelector(".topbar").offsetHeight;
  document.documentElement.style.setProperty("--top", `${h}px`);
}

const onInput = () => {
  readForm();
  changed();
};
form.addEventListener("input", onInput);
sortSelect.addEventListener("change", onInput);
form.addEventListener("submit", (e) => e.preventDefault());
$("more").addEventListener("click", () => {
  shown += PAGE_SIZE;
  render();
});
$("reset").addEventListener("click", () => {
  state = { ...DEFAULTS };
  syncForm();
  buildChips();
  changed();
});
$("filterToggle").addEventListener("click", (e) => {
  const open = form.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", open);
});
$("mapToggle").addEventListener("change", (e) => setMap(e.target.checked));
$("refresh").addEventListener("click", () => refresher.start());
$("tokenDialog").addEventListener("close", () => {
  const dlg = $("tokenDialog");
  const token = $("tokenInput").value.trim();
  $("tokenInput").value = "";
  if (dlg.returnValue === "save" && token) {
    store.set("ghToken", token);
    refresher.start();
  }
});
addEventListener("resize", syncTopHeight);

syncTopHeight();
syncForm();
setMap(store.get("showMap", true));
loadData().catch(() => {
  $("meta").textContent = "Daten konnten nicht geladen werden.";
});
