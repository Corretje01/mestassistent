// kaart.js — KMZ-only: percelen via KMZ upload plotten + automatische berekening
// - Handmatige klikselectie uitgeschakeld
// - Wettelijke grondsoort via Netlify function 'wettelijkeGrondsoort'
// - “Bemestbaar” afgeleid van “Geen norm” in stikstofnormen_tabel2.json
// - “Review nodig” alleen als gewascode niet in normen voorkomt (badge toont code)
// - Opp. uit KMZ robuust geparsed: 'ha' of 'm²/m2' of getal; >1000 ⇒ m² → /10.000
// - Stuurt kmz:linking:start/progress/end events voor spinner/status
// - Optionele filter UI: <select id="parcelFilter"> (zie comment onderaan)

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

// Opp. parser uit KMZ: accepteert '2.9574ha', '29574 m²', '29574', '2,9574 ha' etc.
function toHaFromKmz(v) {
  const sRaw = String(v ?? '').trim().toLowerCase();
  if (!sRaw) return 0;

  const s = sRaw.replace(/\s+/g, ' ').replace(',', '.');

  // expliciete units
  if (s.includes('ha')) {
    const num = parseFloat(s.replace('ha', '').trim());
    return Number.isFinite(num) ? num : 0;
  }
  if (s.includes('m²') || s.includes('m2') || s.includes(' m ')) {
    // m² → ha
    const num = parseFloat(s.replace(/[^\d.+-eE]/g, '')); // laat alleen getal over
    return Number.isFinite(num) ? (num / 10_000) : 0;
  }

  // geen unit → heuristiek:
  // > 1000 ⇒ waarschijnlijk m² → /10.000, anders behandelen als ha
  const num = parseFloat(s.replace(/[^\d.+-eE]/g, ''));
  if (!Number.isFinite(num)) return 0;
  return (num > 1000) ? (num / 10_000) : num;
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
  if (!codeStr) return true; // geen code → ga uit van bemestbaar
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
    `<span class="badge ${cls}" style="padding:.1rem .4rem;border-radius:8px;font-size:.75rem;">${txt}</span>`;
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

/* ---------------------------------
   4) UI-lijst + filter
--------------------------------- */
function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;

  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.dataset.id = p.id;

    const isTG = Number(p.gewasCode) === 266;
    div.innerHTML = `
      <h3 style="display:flex;align-items:center;gap:.5rem;">
        <span>Perceel ${escapeHtml(p.name)}</span>
        ${renderBadges(p.badges)}
      </h3>

      <div class="field-group"><label>Opp. (ha)</label><input readonly value="${escapeHtml(p.ha ?? '')}"></div>
      <div class="field-group"><label>Gewascode</label><input readonly value="${escapeHtml(p.gewasCode ?? '')}"></div>

      ${isTG ? `
        <div class="field-group">
          <label>Variant (tijdelijk grasland 266)</label>
          <select class="tg-variant"></select>
        </div>
      ` : `
        <div class="field-group"><label>Gewasnaam</label><input readonly value="${escapeHtml(p.gewasNaam ?? '')}"></div>
      `}

      <div class="field-group"><label>Grondsoort (wettelijk)</label><input readonly value="${escapeHtml(p.grondsoort ?? '')}"></div>

      <button class="remove-btn">Verwijder</button>
    `;

    // Verwijder-knop
    div.querySelector('.remove-btn').onclick = () => {
      if (p.layer) map.removeLayer(p.layer);
      parcels = parcels.filter(x => x.id !== p.id);
      renderParcelList();
      dispatchParcelsChanged();
      applyParcelFilter(currentFilter); // zorg dat filter actief blijft
    };

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

  // Na render filter meteen toepassen (als UI aanwezig is)
  initParcelFilterUI();
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

  // kaartlagen dimmen/verbergen (hier: dimmen voor context)
  for (const p of parcels) {
    const show = matchesFilter(p, filterKey);
    try {
      p.layer.setStyle({
        opacity: show ? 1 : 0.2,
        fillOpacity: show ? 0.2 : 0.04
      });
    } catch {}
  }
}

function initParcelFilterUI() {
  const sel = document.getElementById('parcelFilter');
  if (!sel || sel.dataset._bound === '1') return;
  sel.dataset._bound = '1';
  sel.addEventListener('change', () => applyParcelFilter(sel.value));
}

/* ---------------------------------
   5) Handmatige klikselectie uit (KMZ-only)
--------------------------------- */
map.on('click', () => { /* handmatige selectie uitgeschakeld */ });

/* ---------------------------------
   6) KMZ-only koppeling
   Verwacht:
     window.__KMZ_RAW = [{ sectorId, gewasCode, gewasNaam, ha, ... }]
     window.__KMZ_GEO.byId[sectorId] = Feature (Polygon/MultiPolygon)
--------------------------------- */
window.addEventListener('rvo:imported', async () => {
  try {
    const rows = Array.isArray(window.__KMZ_RAW) ? window.__KMZ_RAW : [];
    const geo  = window.__KMZ_GEO && window.__KMZ_GEO.byId ? window.__KMZ_GEO.byId : null;
    if (!rows.length || !geo) return;

    // Start progress UI
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
      const layer = L.geoJSON(feat.geometry, { style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 } }).addTo(map);

      // Oppervlakte: KMZ leidend, robuust geparsed
      const haFixed = toHaFromKmz(row.ha).toFixed(2);

      parcels.push({
        id: uuid(),
        layer,
        name: feat.properties?.weergavenaam || feat.properties?.identificatie || row.sectorId,
        ha: haFixed,
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

  } catch (err) {
    console.error('[kaart] rvo:imported (KMZ) fout:', err);
    window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added: 0 } }));
    alert('Er ging iets mis bij het plotten van de geüploade percelen.');
  }
});

/* ---------------------------------
   7) Utils
--------------------------------- */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Init
renderParcelList();
dispatchParcelsChanged();

/*
  ▼▼▼ Optionele filter UI in je HTML (bijv. boven de lijst) ▼▼▼
  <div class="card" style="margin:.5rem 0; display:flex; gap:.5rem; align-items:center;">
    <label for="parcelFilter" style="min-width:9rem;">Toon percelen:</label>
    <select id="parcelFilter">
      <option value="all">Alle</option>
      <option value="bemestbaar">Bemestbaar</option>
      <option value="niet">Niet-bemestbaar</option>
    </select>
  </div>
*/
