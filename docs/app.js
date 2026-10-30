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

const DISTRICT_NAMES = {
  1: "Innere Stadt", 2: "Leopoldstadt", 3: "Landstraße", 4: "Wieden", 5: "Margareten",
  6: "Mariahilf", 7: "Neubau", 8: "Josefstadt", 9: "Alsergrund", 10: "Favoriten",
  11: "Simmering", 12: "Meidling", 13: "Hietzing", 14: "Penzing", 15: "Rudolfsheim-Fünfhaus",
  16: "Ottakring", 17: "Hernals", 18: "Währing", 19: "Döbling", 20: "Brigittenau",
  21: "Floridsdorf", 22: "Donaustadt", 23: "Liesing",
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
const favs = new Set(store.get("favs", []));
const hidden = new Set(store.get("hidden", []));
const previousVisit = store.get("lastVisit", null);
store.set("lastVisit", new Date().toISOString());

const form = document.getElementById("filters");
const $ = (id) => document.getElementById(id);
const fmtEuro = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 1 });
const fmtDate = new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" });

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function isNew(item) {
  const since = previousVisit ? new Date(previousVisit) : new Date(Date.now() - 24 * 3600e3);
  return new Date(item.first_seen) > since;
}

function allPlatforms() {
  return Object.keys(data.status || {});
}

function buildChips() {
  const d = $("districts");
  d.innerHTML = "";
  for (let n = 1; n <= 23; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = n;
    b.title = DISTRICT_NAMES[n];
    b.setAttribute("aria-pressed", state.districts.includes(n));
    b.addEventListener("click", () => {
      state.districts = state.districts.includes(n) ? state.districts.filter((x) => x !== n) : [...state.districts, n];
      b.setAttribute("aria-pressed", state.districts.includes(n));
      changed();
    });
    d.append(b);
  }

  const p = $("platforms");
  p.innerHTML = "";
  for (const name of allPlatforms()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = name;
    const on = () => !state.platforms || state.platforms.includes(name);
    b.setAttribute("aria-pressed", on());
    b.addEventListener("click", () => {
      const current = state.platforms || allPlatforms();
      state.platforms = on() ? current.filter((x) => x !== name) : [...current, name];
      b.setAttribute("aria-pressed", on());
      changed();
    });
    p.append(b);
  }
}

function syncForm() {
  for (const el of form.elements) {
    if (!el.name || !(el.name in state)) continue;
    if (el.type === "checkbox") el.checked = !!state[el.name];
    else el.value = state[el.name] ?? "";
  }
}

function readForm() {
  for (const el of form.elements) {
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

function card(x) {
  const li = document.createElement("li");
  li.className = "item" + (hidden.has(x.id) ? " hidden" : "");
  const facts = [
    x.price != null ? `<span class="price" title="${esc(x.price_note)}">${fmtEuro.format(x.price)}</span>` : "<span>Preis k. A.</span>",
    x.area != null ? `<span>${fmtNum.format(x.area)} m²</span>` : "",
    x.rooms != null ? `<span>${fmtNum.format(x.rooms)} Zi.</span>` : "",
    x.district ? `<span>${x.district}. ${esc(DISTRICT_NAMES[x.district])}</span>` : "",
    x.price && x.area ? `<span class="muted">${fmtNum.format(x.price / x.area)} €/m²</span>` : "",
  ].join("");
  const outdoor = x.outdoor && x.outdoor.length ? `<span class="tag out">${esc(x.outdoor.join(", "))}</span>` : "";
  li.innerHTML = `
    ${x.image ? `<img class="thumb" loading="lazy" referrerpolicy="no-referrer" src="${esc(x.image)}" alt="">` : `<div class="thumb"></div>`}
    <div>
      <h2><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || "Ohne Titel")}</a></h2>
      <div class="facts">${facts}</div>
      <div class="tags">
        ${isNew(x) ? '<span class="tag new">Neu</span>' : ""}
        ${outdoor}
        ${x.swap ? '<span class="tag">Tausch/Wohnticket</span>' : ""}
        <span class="tag">${esc(x.platform)}</span>
        <span class="muted">seit ${fmtDate.format(new Date(x.first_seen))}</span>
        <span class="actions">
          <button type="button" data-act="fav" aria-pressed="${favs.has(x.id)}" title="Merken">★</button>
          <button type="button" data-act="hide" aria-pressed="${hidden.has(x.id)}" title="Ausblenden">✕</button>
        </span>
      </div>
    </div>`;
  li.querySelector('[data-act="fav"]').addEventListener("click", (e) => toggle(favs, "favs", x.id, e.currentTarget));
  li.querySelector('[data-act="hide"]').addEventListener("click", (e) => {
    toggle(hidden, "hidden", x.id, e.currentTarget);
    render();
  });
  return li;
}

function toggle(set, key, id, button) {
  set.has(id) ? set.delete(id) : set.add(id);
  store.set(key, [...set]);
  button.setAttribute("aria-pressed", set.has(id));
}

function render() {
  const items = data.listings.filter(matches).sort(SORTS[state.sort] || SORTS.new);
  const fresh = items.filter(isNew).length;
  $("count").textContent = `${items.length} Angebote` + (fresh ? `, davon ${fresh} neu` : "");
  const list = $("list");
  list.replaceChildren(...items.map(card));
}

function renderMeta() {
  $("meta").textContent = data.updated ? `Stand: ${fmtDate.format(new Date(data.updated))}` : "Noch keine Daten";
  $("sources").innerHTML = Object.entries(data.status || {})
    .map(([name, s]) =>
      s.ok
        ? `<span>✓ ${esc(name)} (${s.count})</span>`
        : `<span class="bad" title="${esc(s.error)}">⚠ ${esc(name)} nicht erreichbar${s.last_ok ? `, zuletzt ${fmtDate.format(new Date(s.last_ok))}` : ""}</span>`
    )
    .join(" ");
}

function changed() {
  store.set("filters", state);
  render();
}

form.addEventListener("input", () => {
  readForm();
  changed();
});
form.addEventListener("submit", (e) => e.preventDefault());
$("reset").addEventListener("click", () => {
  state = { ...DEFAULTS };
  syncForm();
  buildChips();
  changed();
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
