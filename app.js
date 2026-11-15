"use strict";
// WGL – Was geht Leipzig? Web-/Mini-App. Statisch, ohne Fremdbibliotheken.
// Daten: events.json vom Branch "data" (öffentlich, ohne geschützte Quellen).
// Sicherheit: Inhalte stammen aus fremden Webseiten/Flyern -> nur als Text einsetzen (kein innerHTML).

const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const DATA_URL = LOCAL ? "dev-events.json"
  : "https://raw.githubusercontent.com/Hui-161/wgl-app/data/events.json";
const CATS = { party: "Party", konzert: "Konzert", theater: "Theater", lesung: "Lesung", film: "Film", sonstiges: "Sonstiges" };
const DEFAULT_CATS = ["party", "konzert"];
const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MAX_ROWS = 400;

// --- Telegram (optional) ------------------------------------------------------
const tg = window.Telegram && window.Telegram.WebApp;
const IN_TG = !!(tg && tg.initData);
if (IN_TG) { document.documentElement.classList.add("tg"); tg.ready(); tg.expand(); }

// --- Speicher (Gerät; in Telegram später CloudStorage) ----------------------------
const store = {
  get(key, fallback) { try { const v = localStorage.getItem("wgl:" + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem("wgl:" + key, JSON.stringify(value)); } catch { /* privat/voll */ } },
};

// --- Hilfsfunktionen -------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") n.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false)
    n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const weekday = (s) => parseIso(s).getDay(); // 0 = Sonntag
const today = () => iso(new Date());
const fmtDay = (s) => { const d = parseIso(s); return `${WD[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
const short = (s) => { const d = parseIso(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u)) ? u : null;

function openLink(url) {
  if (IN_TG && /^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
  else if (IN_TG) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
function linkButton(label, url, cls) {
  return el("a", { href: url, class: cls, rel: "noopener noreferrer", target: "_blank",
    on: { click: (e) => { e.preventDefault(); openLink(url); } } }, label);
}

// --- Zeiträume -------------------------------------------------------------------
function weekendOf(t) {           // Freitag bis Sonntag; läuft es schon, ab heute
  const wd = weekday(t);
  if (wd === 5 || wd === 6 || wd === 0) return [t, addDays(t, wd === 0 ? 0 : 7 - wd)];
  const fri = addDays(t, 5 - wd);
  return [fri, addDays(fri, 2)];
}
function weekOf(t) { const wd = (weekday(t) + 6) % 7; return [t, addDays(t, 6 - wd)]; } // bis Sonntag
const RANGES = {
  heute: () => ({ kind: "day", first: today(), last: today(), label: "Heute" }),
  morgen: () => { const d = addDays(today(), 1); return { kind: "day", first: d, last: d, label: "Morgen" }; },
  wochenende: () => { const [a, b] = weekendOf(today()); return { kind: "weekend", first: a, last: b, label: "Wochenende" }; },
  woche: () => { const [a, b] = weekOf(today()); return { kind: "week", first: a, last: b, label: "Diese Woche" }; },
};
function rangeText(r) {
  if (r.kind === "day") {
    const rel = r.first === today() ? "Heute · " : r.first === addDays(today(), 1) ? "Morgen · " : "";
    return rel + fmtDay(r.first);
  }
  return `${r.kind === "weekend" ? "Wochenende" : "Woche"} · ${short(r.first)} – ${short(r.last)}`;
}
function step(r, dir) {
  if (r.kind === "day") { const d = addDays(r.first, dir); return { kind: "day", first: d, last: d }; }
  if (r.kind === "weekend") {
    const fri = addDays(r.last, -2 + 7 * dir);       // r.last ist immer ein Sonntag
    return { kind: "weekend", first: fri, last: addDays(fri, 2) };
  }
  const mon = addDays(r.first, -((weekday(r.first) + 6) % 7) + 7 * dir);
  return { kind: "week", first: mon, last: addDays(mon, 6) };
}

// --- Zustand ---------------------------------------------------------------------
const state = {
  data: null,
  range: RANGES.heute(), rangeKey: "heute",
  cats: new Set(store.get("cats", DEFAULT_CATS)),
  genres: new Set(store.get("genres", [])),
  hidden: new Set(store.get("hidden", [])),
  saved: store.get("saved", {}),       // key -> {d, ti, v} (damit Gemerktes auch nach Ablauf lesbar bleibt)
  search: "",
  tab: "liste",
};

function visible(e) {
  if (state.hidden.has(e.v)) return false;
  if (state.cats.size && !state.cats.has(e.c)) return false;
  if (state.genres.size && !e.g.some((g) => state.genres.has(g))) return false;
  if (state.search) {
    const hay = `${e.ti} ${venueName(e.v)} ${e.s} ${(e.gl || []).join(" ")}`.toLowerCase();
    return state.search.split(/\s+/).every((w) => hay.includes(w));
  }
  return e.d >= state.range.first && e.d <= state.range.last;
}
const venueName = (k) => (state.data.venues[k] && state.data.venues[k].n) || k;

// --- Darstellung -------------------------------------------------------------------
function renderChips() {
  const z = $("zeitraum"); z.replaceChildren();
  for (const [key, label] of [["heute", "Heute"], ["wochenende", "Wochenende"], ["woche", "Woche"]])
    z.append(el("button", { class: "chip" + (state.rangeKey === key ? " on" : ""), on: { click: () => {
      state.rangeKey = key; state.range = RANGES[key](); state.search = ""; $("suche").value = ""; render(); } } }, label));

  const k = $("kategorien"); k.replaceChildren();
  for (const [key, label] of Object.entries(CATS))
    k.append(el("button", { class: "chip" + (state.cats.has(key) ? " on" : ""), on: { click: () => {
      state.cats.has(key) ? state.cats.delete(key) : state.cats.add(key);
      store.set("cats", [...state.cats]); render(); } } }, label));

  const g = $("genres"); g.replaceChildren();
  g.append(el("span", { class: "muted chip-label" }, "Genres:"));
  for (const [key, label] of Object.entries(state.data.genres))
    g.append(el("button", { class: "chip" + (state.genres.has(key) ? " on" : ""), on: { click: () => {
      state.genres.has(key) ? state.genres.delete(key) : state.genres.add(key);
      store.set("genres", [...state.genres]); render(); } } }, label));

  $("zeitraum-text").textContent = state.search ? `Suche: alle kommenden Termine` : rangeText(state.range);
  $("datum").value = state.range.first;
}

function eventRow(e) {
  const meta = [venueName(e.v), ...(e.gl || []).slice(0, 2)].join(" · ");
  return el("button", { class: "ev", on: { click: () => openDetail(e) } },
    el("span", { class: "time" }, e.t || "–"),
    el("span", { class: "title" }, e.ti, e.st ? el("span", { class: "badge " + e.st }, e.st) : null),
    state.saved[e.k] ? el("span", { class: "star", "aria-label": "gemerkt" }, "★") : el("span"),
    el("span", { class: "meta" }, meta));
}

function renderList(target, events, emptyText) {
  target.replaceChildren();
  if (!events.length) { target.append(el("p", { class: "empty" }, emptyText)); return; }
  let day = null, box = null, n = 0;
  for (const e of events) {
    if (n++ >= MAX_ROWS) { target.append(el("p", { class: "empty" }, `… und ${events.length - MAX_ROWS} weitere – bitte Suche oder Filter eingrenzen.`)); break; }
    if (e.d !== day) { day = e.d; box = el("div", { class: "day" }, el("h3", {}, fmtDay(day))); target.append(box); }
    box.append(eventRow(e));
  }
}

// --- Karte (Leaflet, erst beim Öffnen des Reiters geladen) ---------------------------
let map = null, markerLayer = null, leafletLoading = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    document.head.append(el("link", { rel: "stylesheet", href: "vendor/leaflet/leaflet.css" }));
    const s = el("script", { src: "vendor/leaflet/leaflet.js" });
    s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
  return leafletLoading;
}

async function showMap() {
  try { await loadLeaflet(); } catch { $("map-hinweis").textContent = "Die Karte konnte nicht geladen werden."; return; }
  if (!map) {
    L.Icon.Default.imagePath = "vendor/leaflet/images/";
    map = L.map("map", { zoomControl: true }).setView([51.3397, 12.3731], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap-Mitwirkende",
      // OSM-Nutzungsregeln verlangen eine Herkunftsangabe – nur die Domain, ohne Seitenpfad
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  map.invalidateSize();
  renderMap(true);
}

function renderMap(fit) {
  if (!map || state.tab !== "karte") return;
  markerLayer.clearLayers();
  const byVenue = new Map();
  let withoutPlace = 0;
  for (const e of state.data.events.filter(visible)) {
    const v = state.data.venues[e.v];
    if (!v || v.lat === undefined) { withoutPlace++; continue; }
    if (!byVenue.has(e.v)) byVenue.set(e.v, []);
    byVenue.get(e.v).push(e);
  }
  const points = [];
  for (const [key, evs] of byVenue) {
    const v = state.data.venues[key];
    const pop = el("div", { class: "map-pop" }, el("h4", {}, `${v.n} (${evs.length})`),
      evs.slice(0, 12).map((e) => el("button", { on: { click: () => openDetail(e) } },
        el("span", { class: "when" }, `${short(e.d)} ${e.t || ""}`), e.ti)),
      evs.length > 12 ? el("p", { class: "muted" }, `… und ${evs.length - 12} weitere`) : null);
    L.marker([v.lat, v.lon], { title: v.n }).bindPopup(pop, { maxWidth: 260 }).addTo(markerLayer);
    points.push([v.lat, v.lon]);
  }
  if (fit && points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
  const total = byVenue.size;
  $("map-hinweis").textContent = (total ? `${total} Locations auf der Karte.` : "Keine Termine mit Ort im gewählten Zeitraum.")
    + (withoutPlace ? ` ${withoutPlace} Termine ohne bekannten Ort (z. B. bewusst verschleierte Szene-Orte) nur in der Liste.` : "");
}

function render() {
  if (!state.data) return;
  renderChips();
  const events = state.data.events.filter(visible);
  renderMap(true);
  renderList($("liste"), events, state.search ? "Nichts gefunden." :
    "In diesem Zeitraum steht (mit diesen Filtern) nichts an. Filter lockern oder weiterblättern.");
  renderSaved();
  $("merk-zahl").textContent = Object.keys(state.saved).length ? `(${Object.keys(state.saved).length})` : "";
}

function renderSaved() {
  const known = new Map(state.data.events.map((e) => [e.k, e]));
  const list = Object.keys(state.saved).map((k) => known.get(k)).filter(Boolean)
    .sort((a, b) => (a.d + (a.t || "")).localeCompare(b.d + (b.t || "")));
  renderList($("gemerkt"), list, "Noch nichts gemerkt. Termin antippen → „Merken“.");
}

function renderVenues() {
  const q = $("loc-suche").value.trim().toLowerCase();
  const counts = {};
  for (const e of state.data.events) counts[e.v] = (counts[e.v] || 0) + 1;
  const ul = $("loc-liste"); ul.replaceChildren();
  Object.entries(state.data.venues)
    .filter(([, v]) => !q || v.n.toLowerCase().includes(q))
    .sort((a, b) => a[1].n.localeCompare(b[1].n, "de"))
    .forEach(([key, v]) => {
      const box = el("input", { type: "checkbox", checked: !state.hidden.has(key), on: { change: (ev) => {
        ev.target.checked ? state.hidden.delete(key) : state.hidden.add(key);
        store.set("hidden", [...state.hidden]); render(); } } });
      ul.append(el("li", {}, el("label", {}, box, v.n, el("span", { class: "count" }, counts[key] || 0))));
    });
}

// --- Detailansicht ---------------------------------------------------------------
function firstAct(title) { return title.split(/\s+(?:\+|&|\/|,|feat\.?|x)\s+|[+,/]/i)[0].trim(); }

function icsFor(e) {
  const esc = (s) => String(s || "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const d = e.d.replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WGL//Was geht Leipzig//DE", "BEGIN:VEVENT",
    `UID:${e.k}@wgl`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`];
  if (e.t) {
    const [h, m] = e.t.split(":");
    lines.push(`DTSTART;TZID=Europe/Berlin:${d}T${h}${m}00`);
    const end = new Date(parseIso(e.d).getTime()); end.setHours(+h + 3, +m);
    lines.push(`DTEND;TZID=Europe/Berlin:${iso(end).replace(/-/g, "")}T${pad(end.getHours())}${pad(end.getMinutes())}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(e.d, 1).replace(/-/g, "")}`);
  }
  lines.push(`SUMMARY:${esc(e.ti)}`, `LOCATION:${esc(venueName(e.v))}, Leipzig`);
  if (e.s) lines.push(`DESCRIPTION:${esc(e.s)}`);
  if (safeUrl(e.u)) lines.push(`URL:${e.u}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function botLink(e) { return state.data.bot ? `https://t.me/${state.data.bot}?start=e_${e.k}` : null; }

function openDetail(e) {
  const box = $("detail"); box.replaceChildren();
  const v = state.data.venues[e.v] || {};
  box.append(...[
    el("h2", {}, e.ti, e.st ? el("span", { class: "badge " + e.st }, e.st) : null),
    el("p", { class: "muted" }, `${fmtDay(e.d)}${e.t ? " · " + e.t + " Uhr" : ""} · ${CATS[e.c] || e.c}`),
    el("p", {}, "📍 ", venueName(e.v)),
    e.gl && e.gl.length ? el("p", {}, "🎵 ", e.gl.join(", ")) : null,
    e.s ? el("p", { class: "muted" }, e.s) : null].filter(Boolean));

  const actions = el("div", { class: "actions" });
  const saved = !!state.saved[e.k];
  actions.append(el("button", { class: saved ? "" : "primary", on: { click: () => {
    if (state.saved[e.k]) delete state.saved[e.k]; else state.saved[e.k] = { d: e.d, ti: e.ti, v: e.v };
    store.set("saved", state.saved); render(); openDetail(e); } } }, saved ? "★ Gemerkt" : "☆ Merken"));
  if (safeUrl(e.u)) actions.append(linkButton("Zur Location-Seite ↗", e.u));
  if (IN_TG && botLink(e)) {
    actions.append(linkButton("Im Bot: Kalender & Erinnerung", botLink(e)));
  } else {
    actions.append(el("button", { on: { click: () => {
      const a = el("a", { href: URL.createObjectURL(new Blob([icsFor(e)], { type: "text/calendar" })),
        download: `${e.d}-${firstAct(e.ti).slice(0, 30).replace(/[^\wäöüß-]+/gi, "_")}.ics` });
      document.body.append(a); a.click(); a.remove(); } } }, "📅 In den Kalender"));
    if (botLink(e)) actions.append(linkButton("Im Telegram-Bot öffnen", botLink(e)));
  }
  actions.append(el("button", { on: { click: () => share(e) } }, "Teilen"));
  if (v.lat !== undefined) actions.append(linkButton("In OpenStreetMap ↗",
    `https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lon}#map=17/${v.lat}/${v.lon}`));
  box.append(actions);

  if (e.c === "konzert") {
    const q = encodeURIComponent(firstAct(e.ti));
    box.append(el("p", { class: "muted" }, "Reinhören: ",
      linkButton("YouTube", `https://www.youtube.com/results?search_query=${q}`), " ",
      linkButton("Bandcamp", `https://bandcamp.com/search?q=${q}`), " ",
      linkButton("Spotify", `https://open.spotify.com/search/${q}`)));
  }
  $("sheet").hidden = false;
  history.replaceState(null, "", "#t=" + e.k);
}

function share(e) {
  const url = (IN_TG && botLink(e)) || `${location.origin}${location.pathname}#t=${e.k}`;
  const text = `${fmtDay(e.d)}${e.t ? " " + e.t : ""} – ${e.ti} @ ${venueName(e.v)}`;
  if (IN_TG) tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  else if (navigator.share) navigator.share({ title: e.ti, text, url }).catch(() => {});
  else navigator.clipboard.writeText(`${text}\n${url}`).then(() => alert("Link kopiert."));
}

function closeSheet() { $("sheet").hidden = true; history.replaceState(null, "", location.pathname + location.search); }

// --- Ereignisse --------------------------------------------------------------------
$("zurueck").addEventListener("click", () => { state.range = step(state.range, -1); state.rangeKey = ""; render(); });
$("weiter").addEventListener("click", () => { state.range = step(state.range, +1); state.rangeKey = ""; render(); });
$("datum").addEventListener("change", (ev) => {
  if (!ev.target.value) return;
  state.range = { kind: "day", first: ev.target.value, last: ev.target.value }; state.rangeKey = ""; render(); });
let searchTimer;
$("suche").addEventListener("input", (ev) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = ev.target.value.trim().toLowerCase(); render(); }, 150); });
$("loc-suche").addEventListener("input", renderVenues);
$("loc-alle").addEventListener("click", () => { state.hidden.clear(); store.set("hidden", []); renderVenues(); render(); });
document.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", closeSheet));
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeSheet(); });
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  state.tab = b.dataset.tab;
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  for (const id of ["liste", "karte", "gemerkt", "einstellungen"]) $(id).hidden = id !== state.tab;
  if (state.tab === "einstellungen") renderVenues();
  if (state.tab === "karte") showMap();
  window.scrollTo(0, 0);
}));
const setTop = () => document.documentElement.style.setProperty("--top-h", $("suche").closest("header").offsetHeight + "px");
window.addEventListener("resize", setTop);

// --- Laden -------------------------------------------------------------------------
async function load() {
  let data = null;
  try {
    const r = await fetch(DATA_URL, { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    data = await r.json();
    if (data.format !== 1) throw new Error("unbekanntes Format");
    try { localStorage.setItem("wgl:cache", JSON.stringify(data)); } catch { /* zu groß/privat */ }
  } catch (err) {
    data = store.get("cache", null);
    $("stand").textContent = data ? "offline – letzter Stand" : "";
    if (!data) { $("liste").replaceChildren(el("p", { class: "empty" }, "Die Termine konnten nicht geladen werden. Bitte später nochmal versuchen.")); return; }
  }
  data.events = data.events.filter((e) => e.d >= today());
  state.data = data;
  if (!$("stand").textContent) {
    const s = new Date(data.stand);
    $("stand").textContent = `Stand ${pad(s.getDate())}.${pad(s.getMonth() + 1)}. ${pad(s.getHours())}:${pad(s.getMinutes())}`;
  }
  render(); setTop();
  const m = location.hash.match(/^#t=([0-9a-f]{12})$/);   // geteilter Link öffnet den Termin
  const hit = m && data.events.find((e) => e.k === m[1]);
  if (hit) openDetail(hit);
}
load();
