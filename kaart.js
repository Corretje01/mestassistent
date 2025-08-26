// kaart.js — KMZ-only: percelen via upload plotten + automatische berekening

// --- Map init ---
const mapEl = document.getElementById('map');
if (!window.L) console.error('Leaflet (L) niet geladen.');
if (!mapEl) console.error('#map element niet gevonden in de DOM.');

const MAP_CENTER = [52.1, 5.1];
const MAP_ZOOM   = 7;

const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

setTimeout(() => map.invalidateSize(), 0);
window.addEventListener('resize', () => {
  clearTimeout(window.__leafletResizeTO);
  window.__leafletResizeTO = setTimeout(() => map.invalidateSize(), 120);
});

// --- State ---
export let parcels = [];

function uuid() { return 'p_' + Math.random().toString(36).slice(2); }

function dispatchParcelsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('parcels:changed', { detail: { parcels: [...parcels] } }));
  } catch (e) {
    console.warn('Kon parcels:changed niet dispatchen:', e);
  }
}

/* =========================
   Helpers
========================= */
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

// Labels voor tijdelijk grasland uit normen-bestand
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

// Bepaal (niet-)bemestbaar via "Geen norm" in stikstofnormen_tabel2.json
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

// Kleine badge-render helper
function renderBadges(b) {
  if (!b) return '';
  const pill = (txt, cls, extraStyle='') =>
    `<span class="badge ${cls}" style="padding:.1rem .4rem;border-radius:8px;font-size:.75rem;${extraStyle}">${txt}</span>`;
  const out = [];

  if (typeof b.bemestbaar === 'boolean') {
    out.push(b.bemestbaar
      ? pill('bemestbaar', 'badge-info')
      : pill('niet-bemestbaar', 'badge-warn'));
  }
  if (b.reviewNeeded) out.push(pill('review nodig', 'badge-warn'));
  if (b.melding)      out.push(pill('melding', 'badge-info'));
  // areaMismatch & versie zijn bewust verwijderd in KMZ-only modus
  return out.join('');
}

/* =========================
   UI lijst
========================= */
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

    div.querySelector('.remove-btn').onclick = () => {
      if (p.layer) map.removeLayer(p.layer);
      parcels = parcels.filter(x => x.id !== p.id);
      renderParcelList();
      dispatchParcelsChanged();
    };

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
}

/* =========================
   Klik-flow uit (KMZ-only)
========================= */
map.on('click', () => { return; });

/* =========================
   KMZ-only koppeling
   Verwacht:
     window.__KMZ_RAW = [{ sectorId, gewasCode, gewasNaam, ha, ... }]
     window.__KMZ_GEO.byId[sectorId] = Feature (Polygon/MultiPolygon)
========================= */
window.addEventListener('rvo:imported', async () => {
  try {
    const rows = Array.isArray(window.__KMZ_RAW) ? window.__KMZ_RAW : [];
    const geo  = window.__KMZ_GEO && window.__KMZ_GEO.byId ? window.__KMZ_GEO.byId : null;
    if (!rows.length || !geo) return;

    // Start progress UI
    window.dispatchEvent(new CustomEvent('kmz:linking:start', { detail: { total: rows.length } }));

    // Leeg huidige selectie
    try {
      for (const p of parcels) { if (p.layer) map.removeLayer(p.layer); }
      parcels.length = 0;
    } catch {}

    const tgLabels = await loadTijdelijkGrasLabels();
    let done = 0, added = 0;

    for (const row of rows) {
      const feat = geo[row.sectorId];
      if (!feat) { done++; window.dispatchEvent(new CustomEvent('kmz:linking:progress', { detail: { done, total: rows.length } })); continue; }

      // Grondsoort (wettelijk) via centroid
      let bodem = {};
      const c = polygonCentroid(feat.geometry);
      if (c) {
        try {
          const b = await fetch(`/.netlify/functions/wettelijkeGrondsoort?lon=${c.lon}&lat=${c.lat}`);
          bodem = b.ok ? await b.json() : {};
        } catch {}
      }

      // 266 → default-variant label (UI kan later per perceel aanpassen)
      let gewasNaam = row.gewasNaam || '';
      if (Number(row.gewasCode) === 266) {
        const fallback = tgLabels.find(k => /1 januari.*15 oktober/i.test(k)) || tgLabels[0] || 'Tijdelijk grasland';
        gewasNaam = fallback;
      }

      // (Niet-)bemestbaar badge
      const bem = await isBemestbaar(row.gewasCode);

      // Teken laag in oorspronkelijke blauwe stijl
      const layer = L.geoJSON(feat.geometry, { style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 } }).addTo(map);

      parcels.push({
        id: uuid(),
        layer,
        name: feat.properties?.weergavenaam || feat.properties?.identificatie || row.sectorId,
        ha: Number(row.ha).toFixed(2),   // KMZ is leidend
        gewasCode: row.gewasCode,
        gewasNaam,
        provincie: '',
        grondsoort: (bodem?.bodemsoortNaam || bodem?.grondsoort || ''),
        landgebruik: (String(gewasNaam).toLowerCase().includes('gras') ? 'Grasland' : 'Bouwland'),
        badges: { reviewNeeded: !!row.reviewNeeded, melding: String(row.melding||'').toLowerCase()==='ja', bemestbaar: bem, isTG: Number(row.gewasCode)===266 },
        _meta:  { sectorId: row.sectorId },
        _source:'upload-kmz'
      });

      added++; done++;
      if (done % 5 === 0 || done === rows.length) {
        window.dispatchEvent(new CustomEvent('kmz:linking:progress', { detail: { done, total: rows.length } }));
      }
    }

    renderParcelList();
    dispatchParcelsChanged();

    try {
      const group = L.featureGroup(parcels.map(p => p.layer).filter(Boolean));
      if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.1));
    } catch {}

    window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added } }));

  } catch (err) {
    console.error('[kaart] rvo:imported (KMZ) fout:', err);
    window.dispatchEvent(new CustomEvent('kmz:linking:end', { detail: { added: 0 } }));
    alert('Er ging iets mis bij het plotten van de geüploade percelen.');
  }
});

/* =========================
   Utils
========================= */
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
