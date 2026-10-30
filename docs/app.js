"use strict";

const DEFAULTS = {
  maxPrice: 850,
  minArea: 50,
  minRooms: 2,
  districts: [2, 3, 4, 5, 6, 7, 8, 12, 14, 15, 16, 20],
  outdoorOnly: false,
  hideSwap: true,
  includeUnknown: false,
  showHidden: false,
  favOnly: false,
  platforms: null, // null = alle
  sort: "new",
};
const PAGE_SIZE = 48;

const DISTRICT_NAMES = {
  1: "Innere Stadt", 2: "Leopoldstadt", 3: "Landstraße", 4: "Wieden", 5: "Margareten",
  6: "Mariahilf", 7: "Neubau", 8: "Josefstadt", 9: "Alsergrund", 10: "Favoriten",
  11: "Simmering", 12: "Meidling", 13: "Hietzing", 14: "Penzing", 15: "Rudolfsheim-Fünfhaus",
  16: "Ottakring", 17: "Hernals", 18: "Währing", 19: "Döbling", 20: "Brigittenau",
  21: "Floridsdorf", 22: "Donaustadt", 23: "Liesing",
};

const ICONS = {
  area: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 15v5h-5M4 4l7 7M20 20l-7-7"/></svg>',
  rooms: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h9M12 3v18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
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
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* privater Modus o. ä. – dann eben ohne Speichern */
    }
  },
};

let data = { listings: [], status: {}, updated: null };
let state = { ...DEFAULTS, ...store.get("filters", {}) };
let shown = PAGE_SIZE;
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
  li.className = "card" + (hidden.has(x.id) ? " is-hidden" : "");

  const g = gallery(x);
  const tags = document.createElement("div");
  tags.className = "overlay-tags";
  tags.innerHTML =
    (isNew(x) ? '<span class="badge new">Neu</span>' : "") +
    (x.outdoor && x.outdoor.length ? `<span class="badge out">${esc(x.outdoor.join(" · "))}</span>` : "");
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
  body.innerHTML = `
    <div class="price-row">
      <span class="price" title="${esc(x.price_note)}">${x.price != null ? fmtEuro.format(x.price) : "Preis auf Anfrage"}</span>
      ${sqm}
    </div>
    <div class="facts">
      ${x.area != null ? `<span>${ICONS.area}${fmtNum.format(x.area)} m²</span>` : ""}
      ${x.rooms != null ? `<span>${ICONS.rooms}${fmtNum.format(x.rooms)} Zi.</span>` : ""}
      ${x.district ? `<span>${ICONS.pin}${x.district}., ${esc(DISTRICT_NAMES[x.district])}</span>` : ""}
    </div>
    <p class="title">${esc(cleanTitle(x.title))}</p>
    <div class="foot">
      <span><span class="platform">${esc(x.platform)}</span> · seit ${fmtDay.format(new Date(x.first_seen))}</span>
      ${x.swap ? '<span class="tag-swap">Tausch</span>' : ""}
      <span class="spacer"></span>
      <button type="button" class="ghost" data-act="hide">${hidden.has(x.id) ? "Einblenden" : "Ausblenden"}</button>
      <a class="open" href="${esc(x.url)}" target="_blank" rel="noopener">Ansehen ${ICONS.external}</a>
    </div>`;
  body.querySelector('[data-act="hide"]').addEventListener("click", (e) => {
    toggle(hidden, "hidden", x.id, e.currentTarget);
    render();
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
  const fresh = items.filter(isNew).length;
  $("count").innerHTML = `${items.length} ${items.length === 1 ? "Wohnung" : "Wohnungen"}` + (fresh ? `<small>${fresh} neu</small>` : "");
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
}

function renderMeta() {
  $("meta").textContent = data.updated ? `Aktualisiert ${fmtDate.format(new Date(data.updated))}` : "Noch keine Daten";
  $("sources").innerHTML = Object.entries(data.status || {})
    .map(([name, s]) =>
      s.ok
        ? `<span class="source" title="${s.count} Angebote im Suchraum"><b>${esc(name)}</b></span>`
        : `<span class="source bad" title="${esc(s.error)}"><b>${esc(name)}</b> nicht erreichbar</span>`
    )
    .join("");
}

function changed() {
  store.set("filters", state);
  shown = PAGE_SIZE;
  render();
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

fetch("data/listings.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
  .then((json) => {
    data = json;
    renderMeta();
    buildChips();
    syncForm();
    render();
  })
  .catch(() => {
    $("meta").textContent = "Daten konnten nicht geladen werden.";
  });
