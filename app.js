/* ============================================================
   ANCE Emergenze Idrauliche – Dashboard (v3)
   - Dati da Google Sheet (CSV via gviz) con fallback JSON locale
   - Marker sempre visibili; lista nascosta finché non si filtra
   - Mappa con fiumi/bacini e confini provinciali
   - Modali: progetto, dichiarazioni, adesione (Apps Script)
   ============================================================ */

// --- CONFIG ---
const SHEET_ID  = "11Z14AM03ONDi1pNgMW0mSV9tcvD2DjFgp4FYVXZt7qw";
const GID       = "0";
const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
const XLSX_URL  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const FALLBACK  = "data/imprese_fallback.json";

// URL del Web App di Google Apps Script per ricevere le adesioni.
// Dopo aver distribuito lo script (vedi apps-script.gs), incolla qui l'URL /exec.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwfO6DnIcROAlcUgniIHbQMYIcI2oXrv1WHa2M7eS7o6Qa9tlQKUTuPfOPe6ohJBcHVfQ/exec";

const PROV_COLORS = {
  TO:"#1565c0", AL:"#c62828", AT:"#6a1b9a", BI:"#00695c", CN:"#e65100",
  NO:"#1b5e20", VC:"#37474f", VB:"#880e4f", AO:"#827717"
};
const PROV_NOMI = {
  TO:"Torino", AL:"Alessandria", AT:"Asti", BI:"Biella", CN:"Cuneo",
  NO:"Novara", VC:"Vercelli", VB:"Verbano-Cusio-Ossola", AO:"Aosta"
};

// Opzioni mezzi/attrezzature per il form di adesione
const MEZZI_OPZIONI = [
  "Escavatori", "Pale gommate", "Pale cingolate", "Pompe idrovore",
  "Autocarri pesanti", "Barche / mezzi galleggianti"
];

// Bacini idrografici canonici (alcuni nomi sono multi-parola)
const CANON_BACINI = [
  "PO","SESIA","DORA","BORMIDA","TANARO","ADDA","TICINO","SCRIVIA","ORBA",
  "CURONE","BORBERA","GRUE","OSSONA","STAFFORA","AGOGNA","TOCE","TERDOPPIO",
  "BELBO","ELVO","CERVO","VIONA","STURA DI LANZO","TORRENTE ORCO",
  "TORRENTE CERVO","TORRENTE ELVO"
];

// --- STATE ---
let IMPRESE = [];
let markers = {};
let map, markerLayer, provinceLayer;
const filters = { search:"", provincia:"", bacino:"", h24:false, soa:false };

const $ = id => document.getElementById(id);

// ============================================================
//  PARSING CSV
// ============================================================
function parseCSV(text){
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (inQ){
      if (c === '"'){ if (text[i+1] === '"'){ field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ','){ row.push(field); field = ""; }
      else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === '\r'){ /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(c => c && c.trim())).map(r => {
    const o = {};
    header.forEach((h, idx) => o[h] = (r[idx] ?? "").trim());
    return o;
  });
}

// Ripristina una coordinata a cui l'import del foglio ha tolto il punto decimale.
// Es. "44685" -> 44.685 (lat), "88" -> 8.8 (lng). Gestisce anche la virgola.
function fixCoord(v, maxAbs){
  let s = String(v == null ? "" : v).trim().replace(",", ".");
  if (!s) return NaN;
  let n = parseFloat(s);
  if (isNaN(n)) return NaN;
  if (s.indexOf(".") !== -1) return n;          // decimale già presente: ok
  while (Math.abs(n) > maxAbs) n /= 10;          // ripristina decimale perso
  return n;
}

// Normalizza la lista: numeri, coordinate, esclude righe senza ragione sociale.
function normalizeImprese(list){
  return list.map(d => {
    const o = Object.assign({}, d);
    o.ordine  = Number(o.ordine) || 0;
    o.addetti = Number(o.addetti) || 0;
    o.lat = fixCoord(o.lat, 90);    // latitudine valida <= 90
    o.lng = fixCoord(o.lng, 12);    // longitudine Piemonte/VdA < 12
    return o;
  }).filter(d => String(d.ragione_sociale || "").trim() && !isNaN(d.lat) && !isNaN(d.lng));
}

// ============================================================
//  CARICAMENTO DATI
// ============================================================
async function loadData(){
  $("status-bar").textContent = "Caricamento dati dal Google Sheet…";
  try {
    const res = await fetch(CSV_URL + "&t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = await res.text();
    const data = parseCSV(txt);
    if (!data.length) throw new Error("CSV vuoto");
    IMPRESE = normalizeImprese(data);
    $("status-bar").textContent = `${IMPRESE.length} imprese · dati dal Google Sheet · ${new Date().toLocaleTimeString("it-IT")}`;
  } catch (err){
    console.warn("Fetch Google Sheet fallito, uso fallback:", err.message);
    try {
      const res = await fetch(FALLBACK + "?t=" + Date.now());
      IMPRESE = normalizeImprese(await res.json());
      $("status-bar").textContent = `${IMPRESE.length} imprese · dati locali (offline)`;
    } catch (e2){
      $("status-bar").textContent = "Errore: impossibile caricare i dati.";
      IMPRESE = [];
    }
  }
  buildFilterOptions();
  updateArticleStats();
  render();
}

// ============================================================
//  HELPER
// ============================================================
const isYes = v => /^s[ìi]$/i.test(String(v || "").trim());
const isSoa = v => /^si$/i.test(String(v || "").trim());
const titol = s => String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function splitContacts(str){
  return String(str || "").split(/\s*[·;,]\s*/).map(s => s.trim()).filter(Boolean);
}
// Bacini canonici presenti nella stringa dell'impresa
function bacinoMatch(impresaBacini){
  const s = " " + String(impresaBacini || "").toUpperCase() + " ";
  return CANON_BACINI.filter(b => s.includes(" " + b + " ") || s.includes(b));
}
function isFilterActive(){
  return !!(filters.search || filters.provincia || filters.bacino || filters.h24 || filters.soa);
}

// ============================================================
//  POPOLA SELECT
// ============================================================
function buildFilterOptions(){
  const provSel = $("f-provincia");
  const provs = [...new Set(IMPRESE.map(i => i.provincia))].sort();
  provSel.innerHTML = '<option value="">Tutte le province</option>' +
    provs.map(p => `<option value="${p}">${p} – ${PROV_NOMI[p] || p}</option>`).join("");

  const bacSel = $("f-bacino");
  const present = new Set();
  IMPRESE.forEach(i => bacinoMatch(i.bacini).forEach(b => present.add(b)));
  const bacini = CANON_BACINI.filter(b => present.has(b));
  bacSel.innerHTML = '<option value="">Tutti i bacini</option>' +
    bacini.map(b => `<option value="${b}">${titol(b)}</option>`).join("");
}

// ============================================================
//  FILTRI (AND)
// ============================================================
function applyFilters(){
  const q = filters.search.toLowerCase();
  return IMPRESE.filter(i => {
    if (q && !(`${i.ragione_sociale} ${i.citta}`.toLowerCase().includes(q))) return false;
    if (filters.provincia && i.provincia !== filters.provincia) return false;
    if (filters.bacino && !bacinoMatch(i.bacini).includes(filters.bacino)) return false;
    if (filters.h24 && !isYes(i.reperibilita_h24)) return false;
    if (filters.soa && !isSoa(i.qualificazione_soa)) return false;
    return true;
  });
}

// ============================================================
//  RENDER
// ============================================================
function render(){
  const visibili = applyFilters();
  updateCounters(visibili);
  renderList(visibili);
  renderMarkers(visibili);
  $("btn-clear").style.display = isFilterActive() ? "block" : "none";
}

function updateCounters(list){
  $("stat-imprese").textContent  = list.length;
  $("stat-addetti").textContent  = list.reduce((s, i) => s + (Number(i.addetti) || 0), 0);
  $("stat-province").textContent = new Set(list.map(i => i.provincia)).size;
}

function updateArticleStats(){
  const ai = $("art-imprese"), aa = $("art-addetti");
  if (ai) ai.textContent = IMPRESE.length;
  if (aa) aa.textContent = IMPRESE.reduce((s, i) => s + (Number(i.addetti) || 0), 0);
}

function renderList(list){
  const box = $("lista");
  // Lista nascosta all'apertura: si popola solo con un filtro/ricerca attivo
  if (!isFilterActive()){
    box.innerHTML = `<div class="list-hint">
      <div class="list-hint-ico">🗺️</div>
      <p>Clicca un punto sulla mappa per vedere i dettagli di un'impresa,<br>
      oppure usa <strong>Ricerca</strong>, <strong>Provincia</strong> o <strong>Bacino</strong> per filtrare l'elenco.</p>
    </div>`;
    return;
  }
  if (!list.length){
    box.innerHTML = '<div class="list-hint"><p>Nessuna impresa trovata con i filtri attivi.</p></div>';
    return;
  }
  box.innerHTML = list.map(i => {
    const col = PROV_COLORS[i.provincia] || "#777";
    const tags = [];
    if (isYes(i.reperibilita_h24)) tags.push('<span class="tag tag-h24">H24</span>');
    if (isSoa(i.qualificazione_soa)) tags.push('<span class="tag tag-soa">SOA</span>');
    tags.push(`<span class="tag tag-add">${i.addetti} addetti</span>`);
    return `<div class="list-item" data-id="${i.ordine}">
      <span class="list-dot" style="background:${col}"></span>
      <div class="list-info">
        <div class="list-name">${i.ragione_sociale}</div>
        <div class="list-city">${titol(i.citta)} (${i.provincia})</div>
        <div class="list-tags">${tags.join("")}</div>
      </div></div>`;
  }).join("");
  box.querySelectorAll(".list-item").forEach(el => {
    el.addEventListener("click", () => selectImpresa(Number(el.dataset.id), true));
  });
}

function renderMarkers(list){
  markerLayer.clearLayers();
  markers = {};
  list.forEach(i => {
    const col = PROV_COLORS[i.provincia] || "#777";
    const size = Math.max(15, Math.min(40, 13 + i.addetti * 0.55));
    const icon = L.divIcon({
      className: "",
      html: `<div class="marker-circle" style="width:${size}px;height:${size}px;background:${col}"></div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2]
    });
    const m = L.marker([i.lat, i.lng], { icon, zIndexOffset: 1000 }).addTo(markerLayer);
    m.bindPopup(popupHTML(i));
    m.on("click", () => { highlightList(i.ordine); openDetail(i); });
    markers[i.ordine] = m;
  });
}

function popupHTML(i){
  return `<div>
    <div class="popup-name">${i.ragione_sociale}</div>
    <div class="popup-meta">${titol(i.citta)} (${i.provincia}) · ${i.addetti} addetti</div>
    <button class="popup-btn" onclick="window.__detail(${i.ordine})">Vedi dettaglio</button>
  </div>`;
}

// ============================================================
//  SELEZIONE / DETTAGLIO
// ============================================================
function selectImpresa(id, fromList){
  const i = IMPRESE.find(x => x.ordine === id);
  if (!i) return;
  highlightList(id);
  if (markers[id]){
    map.setView([i.lat, i.lng], Math.max(map.getZoom(), 10), { animate: true });
    markers[id].openPopup();
  }
  openDetail(i);
  if (window.innerWidth <= 760 && fromList) $("sidebar").classList.remove("open");
}
window.__detail = id => { const i = IMPRESE.find(x => x.ordine === id); if (i) openDetail(i); };

function highlightList(id){
  document.querySelectorAll(".list-item").forEach(el => {
    el.classList.toggle("active", Number(el.dataset.id) === id);
    if (Number(el.dataset.id) === id) el.scrollIntoView({ block: "nearest" });
  });
}

function openDetail(i){
  const col = PROV_COLORS[i.provincia] || "#777";
  $("detail-header").style.background = col;
  $("detail-prov").textContent = `${i.provincia} · ${PROV_NOMI[i.provincia] || ""}`;
  $("detail-name").textContent = i.ragione_sociale;

  const logoBox = $("detail-logo");
  if (i.logo && String(i.logo).trim()){
    logoBox.innerHTML = `<img src="${i.logo}" alt="${i.ragione_sociale}" onerror="this.parentNode.style.display='none'">`;
    logoBox.style.display = "block";
  } else { logoBox.style.display = "none"; logoBox.innerHTML = ""; }

  const soaYes = isSoa(i.qualificazione_soa);
  const h24Yes = isYes(i.reperibilita_h24);
  const bacini = bacinoMatch(i.bacini).map(b => `<span class="chip chip-bacino">${titol(b)}</span>`).join("") || "—";
  const telList = splitContacts(i.telefono).map(t => `<a href="tel:${t.replace(/[^\d+]/g, "")}">${t}</a>`).join("<br>") || "—";
  const emailList = splitContacts(i.email).map(e => `<a href="mailto:${e}">${e}</a>`).join("<br>") || "—";

  $("detail-body").innerHTML = `
    <div class="detail-section">
      <h4>Contatti</h4>
      <div class="detail-row"><span class="lbl">Persona di riferimento</span>${titol(i.persona_riferimento) || "—"}</div>
      <div class="detail-row"><span class="lbl">Indirizzo</span>${i.indirizzo}, ${titol(i.citta)} (${i.provincia})</div>
      <div class="detail-row"><span class="lbl">Telefono</span>${telList}</div>
      <div class="detail-row"><span class="lbl">E-mail</span>${emailList}</div>
    </div>
    <div class="detail-section">
      <h4>Capacità operativa</h4>
      <div class="detail-row">
        <span class="chip ${soaYes ? "chip-yes" : "chip-no"}">SOA: ${i.qualificazione_soa || "—"}</span>
        <span class="chip ${h24Yes ? "chip-yes" : "chip-no"}">Reperibilità H24: ${i.reperibilita_h24 || "—"}</span>
      </div>
      <div class="detail-row"><span class="lbl">Numero medio addetti</span>${i.addetti}</div>
    </div>
    <div class="detail-section">
      <h4>Personale qualificato</h4>
      <div class="detail-row">${titol(i.qualificazione_personale) || "—"}</div>
    </div>
    <div class="detail-section">
      <h4>Mezzi e attrezzature</h4>
      <div class="detail-row">${titol(i.mezzi) || "—"}</div>
    </div>
    <div class="detail-section">
      <h4>Bacini idrografici</h4>
      <div class="detail-row">${bacini}</div>
    </div>`;
  $("detail").classList.add("open");
}

// ============================================================
//  MAPPA
// ============================================================
function initMap(){
  const voyager = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19, subdomains: "abcd",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>'
  });
  const rivers = L.tileLayer("https://{s}.tile.openstreetmap.fr/openriverboatmap/{z}/{x}/{y}.png", {
    maxZoom: 18, subdomains: "abc",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · OpenRiverboatMap'
  });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  map = L.map("map", { zoomControl: true, layers: [voyager] }).setView([45.2, 7.9], 8);

  provinceLayer = L.geoJSON(null, {
    style: f => {
      const col = PROV_COLORS[provSiglaOf(f.properties)] || "#888";
      return { color: col, weight: 2.5, opacity: 0.9, fillColor: col, fillOpacity: 0.04 };
    },
    onEachFeature: (f, lyr) => {
      const sig = provSiglaOf(f.properties);
      lyr.bindTooltip(`${PROV_NOMI[sig] || sig}`, { sticky: true });
    }
  });

  markerLayer = L.layerGroup().addTo(map);

  L.control.layers(
    { "Mappa": voyager, "Idrografia (fiumi e bacini)": rivers, "OpenStreetMap": osm },
    { "Confini provinciali": provinceLayer },
    { collapsed: false }
  ).addTo(map);

  loadProvinceBoundaries();
}

function provSiglaOf(p){
  if (!p) return "";
  return String(p.prov_acr || p.SIGLA || p.sigla || p.prov_sigla || "").toUpperCase().trim();
}

async function loadProvinceBoundaries(){
  const SRC = "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson";
  const NOSTRE = new Set(["TO","AL","AT","BI","CN","NO","VC","VB","AO"]);
  try {
    const res = await fetch(SRC);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const gj = await res.json();
    const feats = (gj.features || []).filter(f => {
      const sig = provSiglaOf(f.properties);
      const reg = String(f.properties && f.properties.reg_name || "").toLowerCase();
      return NOSTRE.has(sig) || reg.includes("piemonte") || reg.includes("aosta");
    });
    provinceLayer.addData({ type: "FeatureCollection", features: feats });
    provinceLayer.addTo(map);
  } catch (e){
    console.warn("Confini provinciali non caricati:", e.message);
  }
}

// ============================================================
//  MODALI
// ============================================================
function openModal(id){ $(id).classList.add("open"); }
function closeModals(){ document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")); }

// ============================================================
//  FORM ADESIONE
// ============================================================
// Popola le checkbox di mezzi e bacini
function populateFormOptions(){
  const mg = $("mezzi-group");
  if (mg) mg.innerHTML = MEZZI_OPZIONI.map(m =>
    `<label class="chk"><input type="checkbox" class="chk-mezzi" value="${m.toUpperCase()}"> ${m}</label>`).join("");
  const bg = $("bacini-group");
  if (bg) bg.innerHTML = CANON_BACINI.map(b =>
    `<label class="chk"><input type="checkbox" class="chk-bacini" value="${b}"> ${titol(b)}</label>`).join("");
}

async function submitAdesione(e){
  e.preventDefault();
  const form = e.target;
  const msg = $("form-msg");
  if (!APPS_SCRIPT_URL){
    msg.textContent = "Invio non ancora configurato (manca l'URL Apps Script).";
    msg.className = "form-msg err";
    return;
  }
  const btn = $("form-submit");
  btn.disabled = true; msg.textContent = "Invio in corso…"; msg.className = "form-msg";
  try {
    const fd = new FormData(form);
    // raccoglie le crocette in un unico campo (come nel foglio)
    const mezziSel = [...form.querySelectorAll(".chk-mezzi:checked")].map(c => c.value);
    const altro = (($("mezzi-altro") || {}).value || "").trim();
    if (altro) mezziSel.push(altro.toUpperCase());
    fd.set("mezzi", mezziSel.join(" "));
    fd.set("bacini", [...form.querySelectorAll(".chk-bacini:checked")].map(c => c.value).join(" "));
    await fetch(APPS_SCRIPT_URL, { method: "POST", body: fd, mode: "no-cors" });
    msg.textContent = "Richiesta inviata. Sarà valutata da ANCE Piemonte e Valle d'Aosta. Grazie!";
    msg.className = "form-msg ok";
    form.reset();
  } catch (err){
    msg.textContent = "Errore di invio. Riprova o contatta ANCE.";
    msg.className = "form-msg err";
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
//  EVENTI UI
// ============================================================
function bindUI(){
  $("f-search").addEventListener("input", e => { filters.search = e.target.value; render(); });
  $("f-provincia").addEventListener("change", e => { filters.provincia = e.target.value; render(); });
  $("f-bacino").addEventListener("change", e => { filters.bacino = e.target.value; render(); });
  $("t-h24").addEventListener("click", e => toggleBadge(e.target, "h24"));
  $("t-soa").addEventListener("click", e => toggleBadge(e.target, "soa"));
  $("btn-clear").addEventListener("click", clearFilters);
  $("detail-close").addEventListener("click", () => $("detail").classList.remove("open"));

  $("btn-refresh").addEventListener("click", async e => {
    e.target.disabled = true; const old = e.target.textContent; e.target.textContent = "…";
    await loadData(); e.target.textContent = old; e.target.disabled = false;
  });
  $("btn-progetto").addEventListener("click", () => openModal("modal-progetto"));
  $("btn-dichiarazioni").addEventListener("click", () => openModal("modal-dichiarazioni"));
  $("btn-aderisci").addEventListener("click", () => openModal("modal-aderisci"));
  $("btn-download").addEventListener("click", () => window.open(XLSX_URL, "_blank"));
  $("btn-fullscreen").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    $("btn-fullscreen").textContent = document.fullscreenElement ? "⛶ Esci" : "⛶ Schermo intero";
    if (map) setTimeout(() => map.invalidateSize(), 200);
  });

  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModals));
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) closeModals(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModals(); });

  $("form-adesione").addEventListener("submit", submitAdesione);
  $("drawer-handle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
}

function toggleBadge(el, key){ filters[key] = !filters[key]; el.dataset.active = filters[key]; render(); }

function toggleFullscreen(){
  const el = document.documentElement;
  if (!document.fullscreenElement){
    (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  }
}

function clearFilters(){
  filters.search = ""; filters.provincia = ""; filters.bacino = ""; filters.h24 = false; filters.soa = false;
  $("f-search").value = ""; $("f-provincia").value = ""; $("f-bacino").value = "";
  $("t-h24").dataset.active = "false"; $("t-soa").dataset.active = "false";
  render();
}

// ============================================================
//  AVVIO
// ============================================================
initMap();
bindUI();
populateFormOptions();
loadData();
