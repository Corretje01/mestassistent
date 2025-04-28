// kaart.js — Meter-precisie selecties met correcte axis‐order en property‐naam

// Debug flag
const DEBUG = true;  // zet tijdelijk op true voor console.logs

// 1) Inladen soilMapping.json
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json niet geladen:', err));

function getBaseCategory(rawName) {
  const entry = soilMapping.find(e => e.name === rawName);
  return entry?.category || 'Onbekend';
}

// 2) Kaart initialiseren
const map = L.map('map').setView([52.1, 5.1], 8);

// 2a) OSM-achtergrond
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2b) Kadastrale perceelsgrenzen (WMS)
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers:      'kadastralekaart:Perceel',
  format:      'image/png',
  transparent: true,
  version:     '1.1.1',
  crs:         L.CRS.EPSG3857,
  attribution: '&copy; Kadaster via PDOK'
}).addTo(map);

// 3) State: geselecteerde percelen
const selected = [];

// 4) Render-helper voor de lijst onder de kaart
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  selected.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${i+1}. ${p.name}</strong>
      <p>Opp: ${p.opp} ha · Bodem: ${p.grond}</p>
      <button data-idx="${i}">🗑 Verwijder</button>
    `;
    div.querySelector('button').onclick = () => {
      map.removeLayer(p.layer);
      selected.splice(i, 1);
      renderParcelList();
    };
    container.appendChild(div);
  });
}

// 5) Bodemsoort ophalen
async function fetchBodemsoort(lon, lat) {
  const url = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Bodemsoort URL →', url);
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Bodemsoort API ${res.status}`);
  const json = await res.json();
  return json.grondsoort || 'Onbekend';
}

// 6) Perceel data ophalen via WFS met BBOX + INTERSECTS(lon lat)
async function fetchPerceel(lon, lat) {
  const delta = 0.00005;  // ~5m
  const minX  = parseFloat(lon) - delta;
  const maxX  = parseFloat(lon) + delta;
  const minY  = parseFloat(lat) - delta;
  const maxY  = parseFloat(lat) + delta;

  // CQL: BBOX(...) AND INTERSECTS(geometry,POINT(lon lat))
  const bbox       = `BBOX(geometry,${minX},${minY},${maxX},${maxY})`;
  const intersects = `INTERSECTS(geometry,POINT(${lon}%20${lat}))`;  // lon lat
  const cql        = `${bbox} AND ${intersects}`;

  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '5',           // 5 is meestal genoeg
    CQL_FILTER:   cql
  });
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;
  if (DEBUG) console.log('WFS URL →', url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS API ${res.status}`);
  const json = await res.json();
  if (DEBUG) console.log('Received features:', json.features);
  return json.features || [];
}

// 7) Klik-handler: meter-precisie multi-select
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const pt  = turf.point([parseFloat(lon), parseFloat(lat)]);

  // 7a) Deselection check
  const hitIdx = selected.findIndex(o =>
    turf.booleanPointInPolygon(pt, o.feat.geometry)
  );
  if (hitIdx !== -1) {
    map.removeLayer(selected[hitIdx].layer);
    selected.splice(hitIdx, 1);
    renderParcelList();
    return;
  }

  try {
    // 7b) Bodemsoort bepalen
    const rawSoil = await fetchBodemsoort(lon, lat);
    const grond   = getBaseCategory(rawSoil);

    // 7c) Perceeldata ophalen
    const features = await fetchPerceel(lon, lat);
    if (features.length === 0) {
      alert('Geen perceel gevonden.');
      return;
    }

    // 7d) Turf-filter
    const exact = features.filter(f =>
      turf.booleanPointInPolygon(pt, f.geometry)
    );
    const feat = exact.length ? exact[0] : features[0];

    // 7e) Highlight
    const layer = L.geoJSON(feat.geometry, {
      style: { color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    // 7f) Zoom naar alle geselecteerde
    const group = L.featureGroup(selected.map(o=>o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding:[20,20] });

    // 7g) Extract props
    const p    = feat.properties;
    const name = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde != null
               ? (p.kadastraleGrootteWaarde/10000).toFixed(2)
               : '';
    const nv   = window.isNV ? 'Ja' : 'Nee';

    // 7h) Opslaan + render
    selected.push({ feat, layer, name, opp, grond, nv });
    renderParcelList();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// 8) Init lege lijst
renderParcelList();
