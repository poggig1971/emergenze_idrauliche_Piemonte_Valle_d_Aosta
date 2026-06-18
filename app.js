/* ============================================================
   ANCE Emergenze Idrauliche – Dashboard (v2: multi-contatto + logo)
   Fonte dati: Google Sheet pubblicato come CSV.
   Se il fetch fallisce, usa data/imprese_fallback.json.
   ============================================================ */

// --- CONFIG ---
const SHEET_ID  = "11Z14AM03ONDi1pNgMW0mSV9tcvD2DjFgp4FYVXZt7qw";
const GID       = "0";
const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const FALLBACK  = "data/imprese_fallback.json";

const PROV_COLORS = {
  TO:"#1565c0", AL:"#c62828", AT:"#6a1b9a", BI:"#00695c", CN:"#e65100",
  NO:"#1b5e20", VC:"#37474f", VB:"#880e4f", AO:"#827717"
};
const PROV_NOMI = {
  TO:"Torino", AL:"Alessandria", AT:"Asti", BI:"Biella", CN:"Cuneo",
  NO:"Novara", VC:"Vercelli", VB:"Verbano-Cusio-Ossola", AO:"Aosta"
};

// --- STATE ---
let IMPRESE = [];                 // cache in memoria
let markers = {};                 // ordine -> marker
let map, markerLayer;
const filters = { search:"", provincia:"", bacino:"", h24:false, soa:false };

// --- DOM ---
const $ = id => document.getElementById(id);

// ============================================================
//  PARSING CSV (gestisce campi tra virgolette)
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
    o.ordine  = Number(o.ordine) || 0;
    o.addetti = Number(o.addetti) || 0;
    o.lat = parseFloat(String(o.lat).replace(",", "."));
    o.lng = parseFloat(String(o.lng).replace(",", "."));
    return o;
  });
}

// ============================================================
//  CARICAMENTO DATI (Google Sheet -> fallback JSON)
// ============================================================
async function loadData(){
  $("status-bar").textContent = "Caricamento dati dal Google Sheet…";
  try {
    const res = await fetch(CSV_URL + "&t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = await res.text();
    const data = parseCSV(txt);
    if (!data.length) throw new Error("CSV vuoto");
    IMPRESE = data.filter(d => !isNaN(d.lat) && !isNaN(d.lng));
    $("status-bar").textContent = `${IMPRESE.length} imprese caricate dal Google Sheet · ${new Date().toLocaleTimeString("it-IT")}`;
  } catch (err){
    console.warn("Fetch Google Sheet fallito, uso fallback:", err.message);
    try {
      const res = await fetch(FALLBACK + "?t=" + Date.now());
      IMPRESE = (await res.json()).filter(d => !isNaN(d.lat) && !isNaN(d.lng));
      $("status-bar").textContent = `${IMPRESE.length} imprese (dati locali offline)`;
    } catch (e2){
      $("status-bar").textContent = "Errore: impossibile caricare i dati.";
      IMPRESE = [];
    }
  }
  buildFilterOptions();
  render();
}

// ============================================================
//  HELPER
// ============================================================
const isYes = v => /^s[ìi]$/i.test(String(v || "").trim());
const titol = s => String(s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function bacinoTokens(str){
  return String(str || "").split(/\s+/).map(s => s.trim()).filter(Boolean);
}

// Divide un campo con più contatti (telefoni o email) separati da · ; ,
function splitContacts(str){
  return String(str || "").split(/\s*[·;,]\s*/).map(s => s.trim()).filter(Boolean);
}

// ============================================================
//  POPOLA SELECT (province + bacini)
// ============================================================
function buildFilterOptions(){
  const provSel = $("f-provincia");
  const provs = [...new Set(IMPRESE.map(i => i.provincia))].sort();
  provSel.innerHTML = '<option value="">Tutte le province</option>' +
    provs.map(p => `<option value="${p}">${p} – ${PROV_NOMI[p] || p}</option>`).join("");

  const bacSel = $("f-bacino");
  const bacSet = new Set();
  IMPRESE.forEach(i => bacinoTokens(i.bacini).forEach(b => bacSet.add(b)));
  const bacini = [...bacSet].sort();
  bacSel.innerHTML = '<option value="">Tutti i bacini</option>' +
    bacini.map(b => `<option value="${b}">${titol(b)}</option>`).join("");
}

// ============================================================
//  FILTRI (combinati in AND)
// ============================================================
function applyFilters(){
  const q = filters.search.toLowerCase();
  return IMPRESE.filter(i => {
    if (q && !(`${i.ragione_sociale} ${i.citta}`.toLowerCase().includes(q))) return false;
    if (filters.provincia && i.provincia !== filters.provincia) return false;
    if (filters.bacino && !bacinoTokens(i.bacini).includes(filters.bacino)) return false;
    if (filters.h24 && !isYes(i.reperibilita_h24)) return false;
    if (filters.soa && !/^si$/i.test(String(i.qualificazione_soa).trim())) return false;
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
}

function updateCounters(list){
  $("stat-imprese").textContent  = list.length;
  $("stat-addetti").textContent  = list.reduce((s, i) => s + (Number(i.addetti) || 0), 0);
  $("stat-province").textContent = new Set(list.map(i => i.provincia)).size;
}

function renderList(list){
  const box = $("lista");
  if (!list.length){ box.innerHTML = '<div style="padding:24px;text-align:center;color:#90a0b8;font-size:13px;">Nessuna impresa trovata con i filtri attivi.</div>'; return; }
  box.innerHTML = list.map(i => {
    const col = PROV_COLORS[i.provincia] || "#777";
    const tags = [];
    if (isYes(i.reperibilita_h24)) tags.push('<span class="tag tag-h24">H24</span>');
    if (/^si$/i.test(String(i.qualificazione_soa).trim())) tags.push('<span class="tag tag-soa">SOA</span>');
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
    const size = Math.max(14, Math.min(40, 12 + i.addetti * 0.55));
    const icon = L.divIcon({
      className: "",
      html: `<div class="marker-circle" style="width:${size}px;height:${size}px;background:${col};opacity:.9"></div>`,
      iconSize: [size, size], iconAnchor: [size/2, size/2]
    });
    const m = L.marker([i.lat, i.lng], { icon }).addTo(markerLayer);
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

  // Logo impresa (se presente nel campo "logo": URL o percorso immagine)
  const logoBox = $("detail-logo");
  if (i.logo && String(i.logo).trim()){
    logoBox.innerHTML = `<img src="${i.logo}" alt="${i.ragione_sociale}" onerror="this.parentNode.style.display='none'">`;
    logoBox.style.display = "block";
  } else {
    logoBox.style.display = "none";
    logoBox.innerHTML = "";
  }

  const soaYes = /^si$/i.test(String(i.qualificazione_soa).trim());
  const h24Yes = isYes(i.reperibilita_h24);
  const bacini = bacinoTokens(i.bacini).map(b => `<span class="chip chip-bacino">${titol(b)}</span>`).join("") || "—";

  // più telefoni / email separati da · ; ,
  const telList = splitContacts(i.telefono)
    .map(t => `<a href="tel:${t.replace(/[^\d+]/g, "")}">${t}</a>`).join("<br>") || "—";
  const emailList = splitContacts(i.email)
    .map(e => `<a href="mailto:${e}">${e}</a>`).join("<br>") || "—";

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
  map = L.map("map", { zoomControl: true }).setView([45.3, 8.0], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
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
  $("detail-close").addEventListener("click", () => $("detail").classList.remove("open"));
  $("btn-refresh").addEventListener("click", async e => {
    e.target.disabled = true;
    const old = e.target.textContent;
    e.target.textContent = "↻ Aggiorno…";
    await loadData();
    e.target.textContent = old;
    e.target.disabled = false;
  });
  $("drawer-handle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
}
function toggleBadge(el, key){
  filters[key] = !filters[key];
  el.dataset.active = filters[key];
  render();
}

// ============================================================
//  AVVIO
// ============================================================
initMap();
bindUI();
loadData();
