// kaart.js — KMZ-only: percelen via upload plotten + automatische berekening
// - Handmatige selectie is uitgezet
// - Luistert op 'rvo:imported' (geleverd door kmzImport.js)
// - Vult 'parcels' exact in de shape die berekening.js verwacht

// --- Map init (met guards) ---
const mapEl = document.getElementById('map');
if (!window.L) {
  console.error('Leaflet (L) niet geladen. Controleer het <script> naar leaflet.js.');
}
if (!mapEl) {
  console.error('#map element niet gevonden in de DOM.');
}

const MAP_CENTER = [52.1, 5.1];
const MAP_ZOOM   = 7;

const map = L.map('map', { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OSM contributors'
}).addTo(map);

// Zorg dat Leaflet de containermaat kent ná CSS layout + bij resizes
setTimeout(() => map.invalidateSize(), 0);
window.addEventListener('resize', () => {
  clearTimeout(window.__leafletResizeTO);
  window.__leafletResizeTO = setTimeout(() => map.invalidateSize(), 120);
});

// --- State ---
export let parcels = [];

function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// Helper: wijzigings-event uitsturen (voor berekening.js)
function dispatchParcelsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('parcels:changed', {
      detail: { parcels: [...parcels] } // veilige kopie
    }));
  } catch (e) {
    console.warn('Kon parcels:changed niet dispatchen:', e);
  }
}

/* =========================================================
   Helpers
========================================================= */
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

// Approx opp (alleen voor mismatch-badge; KMZ-ha blijft leidend)
function approxHa(geom) {
  const polys = (geom?.type === 'Polygon') ? [geom.coordinates]
              : (geom?.type === 'MultiPolygon') ? geom.coordinates
              : [];
  let m2 = 0;
  for (const poly of polys) {
    const ring = poly[0] || [];
    if (ring.length < 3) continue;
    const lat0 = ring[0][1] * Math.PI/180;
    const mPerDegLat = 111132.92 - 559.82*Math.cos(2*lat0) + 1.175*Math.cos(4*lat0);
    const mPerDegLon = 111412.84*Math.cos(lat0) - 93.5*Math.cos(3*lat0);
    let area = 0;
    for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
      const [x1d,y1d] = ring[j], [x2d,y2d] = ring[i];
      const x1 = x1d * mPerDegLon, y1 = y1d * mPerDegLat;
      const x2 = x2d * mPerDegLon, y2 = y2d * mPerDegLat;
      area += (x1*y2 - x2*y1);
    }
    m2 += Math.abs(area / 2);
  }
  return m2 / 10_000; // ha
}

// Labels voor tijdelijk grasland uit normen-bestand
let __tgLabelsCache = null;
async function loadTijdelijkGrasLabels() {
  if (__tgLabelsCache) return __tgLabelsCache;
  try {
    const norms = await fetchJson('/data/stikstofnormen_tabel2.json'); // bestaande bron in berekening.js
    const keys = Object.keys(norms || {});
    const tg = keys.filter(k => k.toLowerCase().startsWith('tijdelijk grasland'));
    __tgLabelsCache = tg;
    return tg;
  } catch {
    __tgLabelsCache = [];
    return __tgLabelsCache;
  }
}

// Kleine badge-render helper
function renderBadges(b) {
  if (!b) return '';
  const pill = (txt, cls) => `<span class="badge ${cls}" style="padding:.1rem .4rem;border-radius:8px;font-size:.75rem;">${txt}</span>`;
  const out = [];
  if (b.reviewNeeded) out.push(pill('review nodig', 'badge-warn'));
  if (b.melding)      out.push(pill('melding', 'badge-info'));
  if (b.areaMismatch) out.push(pill('opp ≠ KMZ', 'badge-warn'));
  if (b.versie)       out.push(pill('v' + String(b.versie), 'badge-muted'));
  return out.join('');
}

/* =========================================================
   UI: lijst renderen (badges + 266-select)
========================================================= */
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

    // Remove
    div.querySelector('.remove-btn').onclick = () => {
      if (p.layer) map.removeLayer(p.layer);
      parcels = parcels.filter(x => x.id !== p.id);
      renderParcelList();
      dispatchParcelsChanged();
    };

    // 266: select vullen + event
    if (isTG) {
      const sel = div.querySelector('.tg-variant');
      loadTijdelijkGrasLabels().then(labels => {
        sel.innerHTML = labels.map(l => {
          const selAttr = (String(p.gewasNaam).toLowerCase() === String(l).toLowerCase()) ? 'selected' : '';
          return `<option ${selAttr} value="${escapeHtml(l)}">${escapeHtml(l)}</option>`;
        }).join('');
      });
      sel.addEventListener('change', () => {
        p.gewasNaam = sel.value; // naam-override → berekening.js matcht via naam (zonder logicawijziging)
        dispatchParcelsChanged();
      });
    }

    container.append(div);
  });
}

/* =========================================================
   Klik-flow uitschakelen (upload-only)
========================================================= */
map.on('click', async () => {
  // KMZ-only modus: handmatige selectie is uitgeschakeld
  return;
});

/* =========================================================
   KMZ-only flow — reageert op rvo:imported (geleverd door kmzImport.js)
   Verwacht:
     window.__KMZ_RAW = [{ sectorId, gewasCode, gewasNaam, ha, ... }]
     window.__KMZ_GEO.byId[sectorId] = Feature (Polygon/MultiPolygon)
========================================================= */
window.addEventListener('rvo:imported', async () => {
  try {
    const rows = Array.isArray(window.__KMZ_RAW) ? window.__KMZ_RAW : [];
    const geo  = window.__KMZ_GEO && window.__KMZ_GEO.byId ? window.__KMZ_GEO.byId : null;
    if (!rows.length || !geo) return;

    // leeg huidige selectie
    try {
      for (const p of parcels) { if (p.layer) map.removeLayer(p.layer); }
      parcels.length = 0;
    } catch {}

    const tgLabels = await loadTijdelijkGrasLabels();

    for (const row of rows) {
      const feat = geo[row.sectorId];
      if (!feat) continue;

      // grondsoort via centroid → wettelijkeGrondsoort
      let bodem = {};
      const c = polygonCentroid(feat.geometry);
      if (c) {
        try {
          const b = await fetch(`/.netlify/functions/wettelijkeGrondsoort?lon=${c.lon}&lat=${c.lat}`);
          bodem = b.ok ? await b.json() : {};
        } catch {}
      }

      // 266: zet default variant-naam voor findNormEntry (UI kan later per perceel aanpassen)
      let gewasNaam = row.gewasNaam || '';
      if (Number(row.gewasCode) === 266) {
        const fallback = tgLabels.find(k => /1 januari.*15 oktober/i.test(k)) || tgLabels[0] || 'Tijdelijk grasland';
        gewasNaam = fallback;
      }

      // Laag tekenen — behoud de oorspronkelijke blauwe stijl
      const layer = L.geoJSON(feat.geometry, {
        style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
      }).addTo(map);

      // badges
      const polyHa = approxHa(feat.geometry);
      const mismatchPct = (polyHa > 0 && row.ha > 0) ? Math.abs(polyHa - row.ha) / row.ha * 100 : 0;
      const areaMismatch = mismatchPct > 1.0;
      const reviewNeeded = !!row.reviewNeeded;
      const melding      = (String(row.melding || '').toLowerCase() === 'ja');
      const versie       = row.sectorVersie || feat.properties?.versie || '';

      parcels.push({
        id: uuid(),
        layer,
        name: feat.properties?.weergavenaam || feat.properties?.identificatie || row.sectorId,
        ha: Number(row.ha).toFixed(2),           // KMZ (tabel) is leidend
        gewasCode: row.gewasCode,
        gewasNaam,
        provincie: '',
        grondsoort: (bodem?.bodemsoortNaam || bodem?.grondsoort || ''),
        landgebruik: (String(gewasNaam).toLowerCase().includes('gras') ? 'Grasland' : 'Bouwland'),
        badges: { reviewNeeded, melding, areaMismatch, versie, isTG: Number(row.gewasCode)===266 },
        _meta:  { sectorId: row.sectorId },
        _source:'upload-kmz'
      });
    }

    // Render + berekening
    renderParcelList();
    dispatchParcelsChanged();

    // Zoom naar alles
    try {
      const group = L.featureGroup(parcels.map(p => p.layer).filter(Boolean));
      if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.1));
    } catch {}

  } catch (err) {
    console.error('[kaart] rvo:imported (KMZ) fout:', err);
    alert('Er ging iets mis bij het plotten van de geüploade percelen.');
  }
});

// --- Kleine util ---
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
