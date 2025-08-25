// kaart.js — selectie togglen + events voor automatische berekening
// (Verbeterd: Excel-first import via rvo:imported, BRP batch-join, bodem via centroid, 266-variant per perceel)

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
   Nieuw: helpers tbv Excel-first flow (niet invasief)
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
      areaSum += Math.abs(a);
      xSum += Math.abs(a) * cx;
      ySum += Math.abs(a) * cy;
    }
  }
  if (areaSum === 0) return null;
  return { lon: xSum / areaSum, lat: ySum / areaSum };
}

// Approx opp (alleen voor mismatch-badge; Excel-ha blijft leidend)
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
  if (b.areaMismatch) out.push(pill('opp ≠ BRP', 'badge-warn'));
  if (b.versie)       out.push(pill('v' + String(b.versie), 'badge-muted'));
  return out.join('');
}

/* =========================================================
   Nieuw: addParcelFromBRP (Excel → BRP feature → parcel)
   Shape blijft identiek aan klik-flow/berekening.js
========================================================= */
async function addParcelFromBRP({ feature, excelRow, bodem }) {
  const gp = feature?.properties || {};

  // 1) Laag tekenen
  const layer = L.geoJSON(feature.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);

  // 2) Naam
  const name = gp.weergavenaam || gp.identificatie || ('BRP ' + (excelRow?.sectorId || 'onbekend'));

  // 3) Gewas (Excel leidend), met 266-variant default
  let gewasNaam = String(excelRow?.gewasNaam || gp.gewas || '');
  const isTG = Number(excelRow?.gewasCode) === 266;
  if (isTG) {
    const tgLabels = await loadTijdelijkGrasLabels();
    const fallback = tgLabels.find(k => /1 januari.*15 oktober/i.test(k)) || tgLabels[0] || gewasNaam;
    gewasNaam = fallback || 'Tijdelijk grasland';
  }

  // 4) Grondsoort via centroid-call response (dek beide veldnamen af)
  const grond = (bodem?.bodemsoortNaam || bodem?.grondsoort || '').trim();

  // 5) Landgebruik uit BRP
  const landgebruik = gp.category || 'Onbekend';

  // 6) Badges
  const polyHa = approxHa(feature.geometry);
  const excelHa = Number(excelRow?.ha || 0);
  const mismatchPct = (polyHa > 0 && excelHa > 0) ? Math.abs(polyHa - excelHa) / excelHa * 100 : 0;
  const areaMismatch = mismatchPct > 1.0;
  const reviewNeeded = !!excelRow?.reviewNeeded;
  const melding      = (String(excelRow?.melding || '').toLowerCase() === 'ja');
  const versie       = excelRow?.sectorVersie || gp.versie || '';

  // 7) Push parcel (shape identiek aan klik-flow)
  parcels.push({
    id: uuid(),
    layer,
    name,
    ha: excelHa.toFixed(2),                                         // Excel is waarheid
    gewasCode:  excelRow?.gewasCode ?? (gp.gewascode?.toString() || ''),
    gewasNaam,
    provincie:  gp.provincie || '',                                 // niet aanwezig in BRP; desnoods leeg
    grondsoort: grond,
    landgebruik,
    // optionele badges
    badges: { reviewNeeded, melding, areaMismatch, versie, isTG },
    _meta:  { sectorId: excelRow?.sectorId || gp.identificatie }
  });
}

/* =========================================================
   UI: lijst renderen (uitgebreid met badges + 266-select)
========================================================= */
function renderParcelList() {
  const container = document.getElementById('parcelList');
  if (!container) return;

  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.className = 'parcel-item';
    div.dataset.id = p.id;

    // 266 heeft select; anders readonly gewasnaam
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
        p.gewasNaam = sel.value;     // naam-override → berekening.js matcht via naam (zonder logicawijziging)
        dispatchParcelsChanged();
      });
    }

    container.append(div);
  });
}

/* =========================================================
   Huidige klik-flow (ongewijzigd) — gebruikt perceel.js + bodemsoort.js
   -> blijvende compat met berekening.js
========================================================= */
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;

  try {
    // 1) Perceel ophalen (kadaster + BRP + provincie in perceel.js)
    const res = await fetch(`/.netlify/functions/perceel?lon=${lng}&lat=${lat}`);
    if (!res.ok) throw new Error('Perceel-API ' + res.status);
    const data = await res.json();
    const feat = data?.features?.[0];
    if (!feat) throw new Error('Geen perceel gevonden');

    const props = feat.properties || {};
    const name  = props.weergavenaam
               || `${props.kadastraleGemeenteWaarde || ''} ${props.sectie || ''} ${props.perceelnummer || ''}`.trim();

    // 2) Toggle: als al geselecteerd → deselecteer en klaar
    const exist = parcels.find(p => p.name === name);
    if (exist) {
      if (exist.layer) map.removeLayer(exist.layer);
      parcels = parcels.filter(p => p.name !== name);
      renderParcelList();
      dispatchParcelsChanged();
      return;
    }

    // 3) Bodemsoort ophalen (centroïde klikpunt)
    const bodemResp = await fetch(`/.netlify/functions/bodemsoort?lon=${lng}&lat=${lat}`);
    if (!bodemResp.ok) throw new Error('Bodemsoort-API ' + bodemResp.status);
    const bodem = await bodemResp.json();

    // 4) Laag tekenen
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // 5) Data samenstellen (let op: props komen uit perceel.js)
    const ha = (props.kadastraleGrootteWaarde != null)
      ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
      : '';

    parcels.push({
      id: uuid(),
      layer,
      name,
      ha,
      gewasCode:  props.gewasCode   || '',       // perceel.js: BRP→gewascode→gewasCode (string) :contentReference[oaicite:4]{index=4}
      gewasNaam:  props.gewasNaam   || '',       // perceel.js: BRP→gewas→gewasNaam       :contentReference[oaicite:5]{index=5}
      provincie:  props.provincie   || '',
      grondsoort: (bodem?.bodemsoortNaam || bodem?.grondsoort || ''),
      landgebruik: props.landgebruik || 'Onbekend' // perceel.js: category→landgebruik     :contentReference[oaicite:6]{index=6}
    });

    // 6) Lijst + event
    renderParcelList();
    dispatchParcelsChanged();

  } catch (err) {
    console.error('Perceel fout:', err);
    alert('Fout bij ophalen perceel. Probeer opnieuw.');
  }
});

/* =========================================================
   Nieuw: Excel-first flow — reageert op rvo:imported
   Verwacht window.__RVO_RAW gevuld door rvoImport.js
========================================================= */
window.addEventListener('rvo:imported', async () => {
  try {
    const rows = Array.isArray(window.__RVO_RAW) ? window.__RVO_RAW : [];
    if (rows.length === 0) return;

    // Unieke IDs & versies
    const ids = [...new Set(rows.map(r => r.sectorId).filter(Boolean))];
    const versies = [...new Set(rows.map(r => r.sectorVersie).filter(Boolean))];
    const jaar = new Date().getFullYear();

    // BRP features chunked ophalen om te lange URL's te vermijden (let jaar = new Date().getFullYear(); // niet gebruiken)
    const byId = {};
    const chunkSize = 40;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const url = `/.netlify/functions/brpByIds?ids=${encodeURIComponent(slice.join(','))}`
                + (versies.length ? `&versies=${encodeURIComponent(versies.join(','))}` : '');
    
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error('[kaart] brpByIds HTTP', resp.status, 'chunk', i/chunkSize + 1);
        alert('Kon BRP-gegevens niet ophalen (/.netlify/functions/brpByIds).');
        return;
      }
      const data = await resp.json();
      Object.assign(byId, data?.byId || {});
    }
    
    if (!Object.keys(byId).length) {
      console.warn('[kaart] brpByIds geen matches terug voor IDs (na chunking). Voorbeeld:', ids.slice(0, 5), '…');
      alert('Geen BRP-percelen gevonden voor de aangeleverde Sector IDs.');
      return;
    }

    // Voor elke Excel-rij: feature + bodem via centroid → parcel push
    for (const row of rows) {
      const feat = byId[row.sectorId];
      if (!feat) continue; // niet gevonden → overslaan (optioneel: rapporteren)
      const c = polygonCentroid(feat.geometry);
      let bodem = {};
      if (c) {
        try {
          const b = await fetch(`/.netlify/functions/bodemsoort?lon=${c.lon}&lat=${c.lat}`);
          bodem = b.ok ? await b.json() : {};
        } catch {}
      }
      await addParcelFromBRP({ feature: feat, excelRow: row, bodem });
    }

    // Render + event
    renderParcelList();
    dispatchParcelsChanged();

    // Optioneel: zoom naar alle lagen
    try {
      const group = L.featureGroup(parcels.map(p => p.layer).filter(Boolean));
      if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.1));
    } catch {}

  } catch (err) {
    console.error('[kaart] rvo:imported flow fout:', err);
    alert('Er ging iets mis bij het plotten van de RVO-percelen.');
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
