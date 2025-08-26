// kaart.js — KMZ-only: percelen via KMZ upload plotten + automatische berekening
// - Handmatige klikselectie uitgeschakeld
// - Wettelijke grondsoort via Netlify function 'wettelijkeGrondsoort'
// - “Bemestbaar” afgeleid van “Geen norm” in stikstofnormen_tabel2.json
// - “Review nodig” alleen als gewascode niet in normen voorkomt (badge toont code)
// - Opp. uit KMZ robuust geparsed: altijd naar ha (m² → /10.000, ha blijft ha)
// - kmz:linking:start/progress/end events → spinner overlay + (optioneel) knopspinner
// - Segmented filter: Alle / Bemestbaar / Niet-bemestbaar + dimmen op kaart

/* ---------------------------------
   1) Map init
--------------------------------- */
const mapEl = document.getElementById('map');
if (!window.L) console.error('Leaflet (L) niet geladen.');
if (!mapEl) console.error('#map element niet gevonden in de DOM.');

const MAP_CENTER = [52.1, 5.1];
const MAP_ZOOM   = 7;

const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

// Zorg dat Leaflet de containermaat kent
setTimeout(() => map.invalidateSize(), 0);
window.addEventListener('resize', () => {
  clearTimeout(window.__leafletResizeTO);
  window.__leafletResizeTO = setTimeout(() => map.invalidateSize(), 120);
});

/* ---------------------------------
   2) State + events
--------------------------------- */
export let parcels = [];
let currentFilter = 'all'; // 'all' | 'bemestbaar' | 'niet'
let currentSort   = 'none'; // 'none' | 'gew_asc' | 'gew_desc'

function uuid() { return 'p_' + Math.random().toString(36).slice(2); }

function dispatchParcelsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('parcels:changed', { detail: { parcels: [...parcels] } }));
  } catch (e) {
    console.warn('Kon parcels:changed niet dispatchen:', e);
  }
}

/* ---------------------------------
   3) Helpers
--------------------------------- */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return res.json();
}

// Centroid voor Polygon/MultiPolygon (EPSG:4326)
function polygonCentroid(geom) {
  const polys = (geom?.type === 'Polygon') ? [geom.coordinates]
              : (geom?.type === 'MultiPolygon') ? geom.coordinates
              : [];
  let areaSum = 0, xSum = 0, ySum = 0;
  for (const poly of polys) {
    const ring = poly[0] || [];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      const cross = x1 * y2 - x2 * y1;
      a += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    a = a / 2;
    if (a !== 0) {
      cx = cx / (6 * a);
      cy = cy / (6 * a);
      const w = Math.abs(a);
      areaSum += w; xSum += w * cx; ySum += w * cy;
    }
  }
  if (areaSum === 0) return null;
  return { lon: xSum / areaSum, lat: ySum / areaSum };
}

// Opp. parser uit KMZ → altijd als ha teruggeven:
// - "2.9574 ha" of "2,9574 ha"  → parse als ha
// - "29574 m²" / "29574 m2"     → / 10.000
// - "29574" (géén unit)         → aanname m² → / 10.000
function toHaFromKmz(v) {
  const raw = String(v ?? '').trim().toLowerCase();
  if (!raw) return 0;

  const s = raw.replace(/\s+/g, ' ').replace(',', '.');

  if (s.includes('ha')) {
    const num = parseFloat(s.replace('ha', '').trim());
    return Number.isFinite(num) ? num : 0;
  }

  // m² of m2 (of geen unit) → altijd / 10.000
  const numeric = parseFloat(s.replace(/[^\d.+-eE]/g, ''));
  if (!Number.isFinite(numeric)) return 0;
  return numeric / 10_000;
}

// Labels voor tijdelijk grasland (266) uit normen-bestand
let __tgLabelsCache = null;
async function loadTijdelijkGrasLabels() {
  if (__tgLabelsCache) return __tgLabelsCache;
  try {
    const norms = await fetchJson('/data/stikstofnormen_tabel2.json');
    const keys = Object.keys(norms || {});
    const tg = keys.filter(k => k.toLowerCase().startsWith('tijdelijk grasland'));
    __tgLabelsCache = tg;
    return tg;
  } catch {
    __tgLabelsCache = [];
    return __tgLabelsCache;
  }
}

// Set met gewascodes uit “Geen norm” (→ niet-bemestbaar)
let __geenNormSet = null;
async function loadGeenNormSet() {
  if (__geenNormSet) return __geenNormSet;
  try {
    const norms = await fetchJson('/data/stikstofnormen_tabel2.json');
    const geen = norms?.['Geen norm']?.Gewascodes || [];
    __geenNormSet = new Set(geen.map(String));
  } catch {
    __geenNormSet = new Set();
  }
  return __geenNormSet;
}
async function isBemestbaar(gewasCode) {
  const set = await loadGeenNormSet();
  const codeStr = String(gewasCode ?? '');
  if (!codeStr) return true; // geen code → bemestbaar aannemen
  return !set.has(codeStr);
}

// Set met ALLE gewascodes uit normen (voor “review nodig”)
let __allGewasCodesSet = null;
async function loadAllGewasCodesSet() {
  if (__allGewasCodesSet) return __allGewasCodesSet;
  try {
    const norms = await fetchJson('/data/stikstofnormen_tabel2.json');
    const set = new Set();
    for (const entry of Object.values(norms || {})) {
      const codes = entry?.Gewascodes;
      if (Array.isArray(codes)) for (const c of codes) set.add(String(c));
    }
    __allGewasCodesSet = set;
  } catch {
    __allGewasCodesSet = new Set();
  }
  return __allGewasCodesSet;
}
async function codeKnownInNormen(gewasCode) {
  const set = await loadAllGewasCodesSet();
  const codeStr = String(gewasCode ?? '');
  if (!codeStr) return false;
  return set.has(codeStr);
}

// Badge-render helper
function renderBadges(b) {
  if (!b) return '';
  const pill = (txt, cls) =>
    `<span class="badge ${cls}" style="padding:.15rem .5rem;border-radius:999px;font-size:.75rem;">${txt}</span>`;
  const out = [];

  if (typeof b.bemestbaar === 'boolean') {
    out.push(b.bemestbaar ? pill('bemestbaar', 'badge-info')
                          : pill('niet-bemestbaar', 'badge-warn'));
  }

  if (b.reviewNeeded) {
    const extra = b.missingCode ? ` (code ${String(b.missingCode)})` : '';
    out.push(pill(`review nodig${extra}`, 'badge-warn'));
  }

  return out.join('');
}

function formatHa(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* ---------------------------------
   4) Spinner overlay + knop spinner (optioneel)
--------------------------------- */
let mapSpinnerEl = null;
function ensureMapSpinner() {
  if (mapSpinnerEl) return mapSpinnerEl;
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:absolute; inset:0; display:none; align-items:center; justify-content:center;
    background:rgba(255,255,255,.55); backdrop-filter:saturate(120%) blur(1px); z-index:500;
  `;
  const inner = document.createElement('div');
  inner.style.cssText = 'display:flex; flex-direction:column; gap:.5rem; align-items:center; font-size:.95rem; color:#333;';
  inner.innerHTML = `
    <div class="spinner" style="
      width:28px;height:28px;border:3px solid rgba(0,0,0,.15);
      border-top-color:#1e90ff;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
    <div class="msg">Koppelen van percelen…</div>
  `;
  wrap.appendChild(inner);

  // keyframes (inline)
  const style = document.createElement('style');
  style.textContent = `@keyframes spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);

  mapEl.style.position = 'relative';
  mapEl.appendChild(wrap);
  mapSpinnerEl = wrap;
  return wrap;
}
function setMapSpinner(visible, text) {
  const el = ensureMapSpinner();
  el.style.display = visible ? 'flex' : 'none';
  const msg = el.querySelector('.msg');
  if (msg && text) msg.textContent = text;
}

// Optioneel: knop met id #kmz-add of #rvo-add upgraden (styling + loading)
function setAddButtonLoading(isLoading, progressText) {
  const btn = document.querySelector('#kmz-add, #rvo-add');
  if (!btn) return;

  // Gebruik het bestaande label in de knop (teller blijft werken)
  const labelEl =
    btn.querySelector('#kmz-label') || document.getElementById('kmz-label');

  // Ruim oude inline styles / spinner van eerdere versies op
  btn.style.border = '';
  btn.style.background = '';
  btn.style.color = '';
  btn.style.boxShadow = '';
  btn.style.padding = '';
  btn.style.borderRadius = '';
  btn.style.opacity = '';
  btn.removeAttribute('aria-busy');

  const sp = btn.querySelector('.btnspin');
  if (sp) sp.remove(); // spinner nooit tonen

  if (isLoading) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (labelEl) labelEl.textContent = progressText || 'Koppelen…';
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (labelEl) labelEl.textContent = 'Koppel percelen';
  }
}

/* ---------------------------------
   5) UI-lijst + segmented filter
--------------------------------- */
function ensureFilterUI() {
  // 1) Zoek bestaande balk of maak ‘m aan
  const section = document.querySelector('.parcel-list-section');
  if (!section) return;

  let wrap = document.getElementById('parcelFilterBar') || section.querySelector('.parcel-filter');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'parcel-filter';
    section.insertBefore(wrap, section.firstChild);
  }

  // 2) Zorg dat de filter-select er is
  let filterSel = wrap.querySelector('#parcelFilter');
  if (!filterSel) {
    const label = document.createElement('label');
    label.className = 'sr-only';
    label.setAttribute('for', 'parcelFilter');
    label.textContent = 'Toon percelen';

    filterSel = document.createElement('select');
    filterSel.id = 'parcelFilter';
    filterSel.className = 'pf-select';
    filterSel.setAttribute('aria-label', 'Toon percelen');
    filterSel.innerHTML = `
      <option value="all">Alle percelen</option>
      <option value="bemestbaar">Bemestbaar</option>
      <option value="niet">Niet-bemestbaar</option>
    `;
    wrap.appendChild(label);
    wrap.appendChild(filterSel);
  }

  // Bind change maar 1x
  if (!filterSel.dataset.bound) {
    filterSel.addEventListener('change', () => applyParcelFilter(filterSel.value));
    filterSel.dataset.bound = '1';
  }
  // Zet huidige waarde + toon de balk
  filterSel.value = currentFilter || 'all';
  wrap.hidden = false;

  // 3) Sorteer-select (A–Z / Z–A op gewas)
  let sortSel = wrap.querySelector('#parcelSort');
  if (!sortSel) {
    sortSel = document.createElement('select');
    sortSel.id = 'parcelSort';
    sortSel.className = 'pf-select';
    sortSel.setAttribute('aria-label', 'Sorteer percelen');
    sortSel.innerHTML = `
      <option value="none">Originele volgorde</option>
      <option value="gew_asc">A–Z (gewas)</option>
      <option value="gew_desc">Z–A (gewas)</option>
    `;
    wrap.appendChild(sortSel);
  }
  if (!sortSel.dataset.bound) {
    sortSel.addEventListener('change', () => applyParcelSort(sortSel.value));
    sortSel.dataset.bound = '1';
  }
  sortSel.value = currentSort || 'none';
}

function segBtnStyle(active) {
  return `
    appearance:none; border:0; padding:.45rem .8rem; font:inherit; cursor:pointer;
    background:${active ? '#1e90ff' : '#fff'};
    color:${active ? '#fff' : '#222'};
    transition:background .2s ease;
  `;
}

function renderParcelList() {
  ensureFilterUI();

  const container = document.getElementById('parcelList');
  if (!container) return;

  container.innerHTML = '';
  
   // respecteer sortering o.b.v. gewas
  const listParcels = [...parcels];
  if (currentSort === 'gew_asc' || currentSort === 'gew_desc') {
    listParcels.sort((a, b) => {
      const an = String(a.gewasNaam || '');
      const bn = String(b.gewasNaam || '');
      const cmp = an.localeCompare(bn, 'nl', { sensitivity: 'base' });
      return currentSort === 'gew_desc' ? -cmp : cmp;
    });
  }

  listParcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.dataset.id = p.id;

    // compact + luchtig: card-achtige blokjes met spacing
    div.style.cssText = `
      border:1px solid #eceff3; border-radius:12px; padding:.65rem .8rem; margin:.5rem 0;
      box-shadow: 0 1px 1px rgba(16,24,40,.04);
    `;

    const isTG = Number(p.gewasCode) === 266;

    // 1 titelregel + 1 meta-regel (+ optionele TG-select)
    div.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;">
        <h3 style="margin:0; font-size:1rem; font-weight:600; line-height:1.2;">
          ${escapeHtml(p.name)}
        </h3>
        <div>${renderBadges(p.badges)}</div>
      </div>

      <p class="meta" style="margin:.35rem 0 0 0; color:#444; font-size:.92rem; line-height:1.45;">
        Opp: <strong>${formatHa(p.ha)} ha</strong>
        &nbsp;·&nbsp; Code: <strong>${escapeHtml(p.gewasCode ?? '')}</strong>
        &nbsp;·&nbsp; Gewas: <strong>${escapeHtml(p.gewasNaam ?? '')}</strong>
        &nbsp;·&nbsp; Grondsoort: <strong>${escapeHtml(p.grondsoort ?? '')}</strong>
      </p>

      ${isTG ? `
        <div class="field-group" style="margin:.5rem 0 0 0;">
          <label style="font-size:.85rem; opacity:.8; display:block; margin:.15rem 0;">Variant tijdelijk grasland (266):</label>
          <select class="tg-variant" style="padding:.35rem .5rem; border-radius:8px; border:1px solid #e3e6ea;"></select>
        </div>
      ` : ``}
    `;

    // 266-varianten
    if (isTG) {
      const sel = div.querySelector('.tg-variant');
      loadTijdelijkGrasLabels().then(labels => {
        sel.innerHTML = labels.map(l => {
          const selAttr = (String(p.gewasNaam).toLowerCase() === String(l).toLowerCase()) ? 'selected' : '';
          return `<option ${selAttr} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`;
        }).join('');
      });
      sel.addEventListener('change', () => {
        p.gewasNaam = sel.value; // naam-override → berekening.js matcht via naam
        dispatchParcelsChanged();
      });
    }

    container.append(div);
  });

  applyParcelFilter(currentFilter);
}

// Filter logica (alleen weergave; berekening blijft op alle parcels gebaseerd)
function matchesFilter(p, filterKey) {
  const bem = !!p?.badges?.bemestbaar;
  if (filterKey === 'bemestbaar')   return bem;
  if (filterKey === 'niet')         return !bem;
  return true; // 'all'
}

function applyParcelFilter(filterKey = 'all') {
  currentFilter = filterKey;

  // lijst verbergen/tonen
  const container = document.getElementById('parcelList');
  if (container) {
    for (const el of container.querySelectorAll('.parcel-item')) {
      const id = el.dataset.id;
      const p  = parcels.find(x => x.id === id);
      el.style.display = (p && matchesFilter(p, filterKey)) ? '' : 'none';
    }
  }

  // kaartlagen dimmen (filter ≠ all → dim overige)
  for (const p of parcels) {
    const show = matchesFilter(p, filterKey);
    try {
      p.layer.setStyle({
        opacity: show ? 1 : 0.15,
        weight: show ? 2 : 1,
        fillOpacity: show ? 0.25 : 0.04
      });
      if (show && p.layer.bringToFront) p.layer.bringToFront();
    } catch {}
  }
}

function applyParcelSort(sortKey = 'none') {
  currentSort = sortKey;
  // Render lijst opnieuw (kaartlagen blijven gelijk)
  renderParcelList();
  // Actieve filter opnieuw toepassen op de nieuwe lijstvolgorde
  applyParcelFilter(currentFilter);
}

/* ---------------------------------
   6) Handmatige klikselectie uit (KMZ-only)
--------------------------------- */
map.on('click', () => { /* handmatige selectie uitgeschakeld */ });

/* ---------------------------------
   7) KMZ-only koppeling
   Verwacht:
     window.__KMZ_RAW = [{ sectorId, gewasCode, gewasNaam, ha, ... }]
     window.__KMZ_GEO.byId[sectorId] = Feature (Polygon/MultiPolygon)
--------------------------------- */
window.addEventListener('rvo:imported', async () => {
  try {
    const rows = Array.isArray(window.__KMZ_RAW) ? window.__KMZ_RAW : [];
    const geo  = window.__KMZ_GEO && window.__KMZ_GEO.byId ? window.__KMZ_GEO.byId : null;
    if (!rows.length || !geo) return;

    // Start progress UI (overlay + knop)
    setMapSpinner(true, 'Koppelen van percelen…');
    setAddButtonLoading(true, 'Koppelen…');
    window.dispatchEvent(new CustomEvent('kmz:linking:start', { detail: { total: rows.length } }));

    // Huidige selectie leegmaken
    try {
      for (const p of parcels) { if (p.layer) map.removeLayer(p.layer); }
      parcels.length = 0;
    } catch {}

    const tgLabels = await loadTijdelijkGrasLabels();
    let done = 0, added = 0;

    for (const row of rows) {
      const feat = geo[row.sectorId];
      if (!feat) {
        done++;
        window.dispatchEvent(new CustomEvent('kmz:linking:progress', { detail: { done, total: rows.length } }));
        continue;
      }

      // Wettelijke grondsoort via centroid
      let bodem = {};
      const c = polygonCentroid(feat.geometry);
      if (c) {
        try {
          const b = await fetch(`/.netlify/functions/wettelijkeGrondsoort?lon=${c.lon}&lat=${c.lat}`);
          bodem = b.ok ? await b.json() : {};
        } catch {}
      }

      // 266 → default-variantlabel
      let gewasNaam = row.gewasNaam || '';
      if (Number(row.gewasCode) === 266) {
        const fallback = tgLabels.find(k => /1 januari.*15 oktober/i.test(k)) || tgLabels[0] || 'Tijdelijk grasland';
        gewasNaam = fallback;
      }

      // Bemestbaar / Review nodig
      const bem = await isBemestbaar(row.gewasCode);
      const known = await codeKnownInNormen(row.gewasCode);
      const reviewNeeded = !known;

      // Teken laag in blauwe stijl
      const layer = L.geoJSON(feat.geometry, { style: { color: '#1e90ff', weight: 2, fillOpacity: 0.25 } }).addTo(map);

      // Oppervlakte: KMZ → altijd naar ha, als **getal** bewaren (geen toFixed hier!)
      const haNum = toHaFromKmz(row.ha);

      parcels.push({
        id: uuid(),
        layer,
        name: feat.properties?.weergavenaam || feat.properties?.identificatie || row.sectorId,
        ha: haNum,
        gewasCode: row.gewasCode,
        gewasNaam,
        provincie: '',
        grondsoort: (bodem?.bodemsoortNaam || bodem?.grondsoort || ''),
        landgebruik: (String(gewasNaam).toLowerCase().includes('gras') ? 'Grasland' : 'Bouwland'),
        badges: {
          bemestbaar: bem,
          reviewNeeded,
          missingCode: reviewNeeded ? String(row.gewasCode ?? '') : null,
          isTG: Number(row.gewasCode) === 266
        },
        _meta:  { sectorId: row.sectorId },
        _source:'upload-kmz'
      });

      added++; done++;
      if (done % 5 === 0 || done === rows.length) {
        window.dispatchEvent(new CustomEvent('kmz:linking:progress', { detail: { done, total: rows.length } }));
        setMapSpinner(true, `Koppelen… ${done}/${rows.length}`);
        setAddButtonLoading(true, `Koppelen… ${done}/${rows.length}`);
      }
    }

    // Render + event
    renderParcelList();
    dispatchParcelsChanged();

    // Zoom naar geselecteerde percelen
    try {
      const group = L.featureGroup(parcels.map(p => p.layer).filter(Boolean));
      if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.1));
    } catch {}

    // Einde progress
    window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added } }));
    setMapSpinner(false);
    setAddButtonLoading(false);

  } catch (err) {
    console.error('[kaart] rvo:imported (KMZ) fout:', err);
    window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added: 0 } }));
    setMapSpinner(false);
    setAddButtonLoading(false);
    alert('Er ging iets mis bij het plotten van de geüploade percelen.');
  }
});

/* ---------------------------------
   8) Klikselectie uit (nogmaals voor de zekerheid)
--------------------------------- */
map.on('click', () => { /* handmatige selectie uitgeschakeld */ });

export function clearAllParcels() {
  try {
    // verwijder layers van de kaart
    for (const p of parcels) {
      try { if (p.layer && map && map.removeLayer) map.removeLayer(p.layer); } catch {}
    }
    parcels.length = 0;         // array leeg
    renderParcelList();         // UI lijst legen
    dispatchParcelsChanged();   // event voor andere modules
  } catch (e) {
    console.warn('clearAllParcels():', e);
  }
}

/* ---------------------------------
   9) Init
--------------------------------- */
renderParcelList();
dispatchParcelsChanged();
