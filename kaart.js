// kaart.js — Direct WFS + CQL + Turf → meter‐precisie selecties

// (1) Debug‐flag
const DEBUG = false;

// (2) SoilMapping inladen (bodemsoort)
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json niet geladen:', err));

function getBaseCategory(raw) {
  const e = soilMapping.find(x => x.name === raw);
  return e?.category || 'Onbekend';
}

// (3) Kaart init
const map = L.map('map').setView([52.1, 5.1], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// (3b) Achtergrond WMS‐laag kadastraal
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers:      'kadastralekaart:Perceel',
  format:      'image/png',
  transparent: true,
  version:     '1.1.1',
  crs:         L.CRS.EPSG3857,
  attribution: '&copy; Kadaster via PDOK'
}).addTo(map);

// (4) Geselecteerde percelen state
const selected = [];

// (5) Renderlijst onder de kaart
function renderParcelList() {
  const box = document.getElementById('parcelList');
  box.innerHTML = '';
  selected.forEach((p,i) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${i+1}. ${p.naam}</strong>
      <p>Opp: ${p.opp} ha · Bodem: ${p.grond} · NV: ${p.nv}</p>
      <button data-idx="${i}">🗑 Verwijder</button>
    `;
    div.querySelector('button').onclick = () => {
      map.removeLayer(p.layer);
      selected.splice(i,1);
      renderParcelList();
    };
    box.appendChild(div);
  });
}

// (6) Haal perceelsfeatures direct van PDOK WFS
async function fetchPerceel(lon, lat) {
  // ±5 m delta
  const d = 0.00005;
  const minX = parseFloat(lon) - d;
  const maxX = parseFloat(lon) + d;
  const minY = parseFloat(lat) - d;
  const maxY = parseFloat(lat) + d;

  // Axis‐order lat lon voor INTERSECTS
  const intersects = `INTERSECTS(geometry,POINT(${lat} ${lon}))`;
  const bbox       = `BBOX(geometry,${minX},${minY},${maxX},${maxY})`;
  const cql        = `${bbox} AND ${intersects}`;

  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '10',
    CQL_FILTER:   cql
  });
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params.toString()}`;
  if (DEBUG) console.log('WFS→', url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS error ${res.status}`);
  const js  = await res.json();
  return js.features || [];
}

// (7) Bodemsoort via proxy‐functie (blijft bestaan)
async function fetchBodemsoort(lon, lat) {
  const res = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
  if (!res.ok) throw new Error(`Bodemsoort API ${res.status}`);
  const body = await res.json();
  return body.grondsoort || 'Onbekend';
}

// (8) Click‐handler → multi‐select / deselect
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6),
        lat = e.latlng.lat.toFixed(6),
        pt  = turf.point([parseFloat(lon), parseFloat(lat)]);

  // (8a) Deselection: klik binnen bestaand polygon?
  const idx = selected.findIndex(o =>
    turf.booleanPointInPolygon(pt, o.feat.geometry)
  );
  if (idx !== -1) {
    map.removeLayer(selected[idx].layer);
    selected.splice(idx,1);
    renderParcelList();
    return;
  }

  try {
    // (8b) Bodemsoort
    const rawGrond = await fetchBodemsoort(lon, lat);
    const grond    = getBaseCategory(rawGrond);

    // (8c) Perceelsdata
    const feats = await fetchPerceel(lon, lat);
    if (!feats.length) {
      alert('Geen perceel gevonden op die plek.');
      return;
    }

    // (8d) Turf‐filter
    const match = feats.filter(f =>
      turf.booleanPointInPolygon(pt, f.geometry)
    );
    const feat = match.length ? match[0] : feats[0];

    // (8e) Highlight
    const layer = L.geoJSON(feat.geometry, {
      style:{ color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    // (8f) Zoom naar alle geselecteerde
    const group = L.featureGroup(selected.map(o=>o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding:[20,20] });

    // (8g) Eigenschappen
    const p = feat.properties;
    const naam = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde != null
               ? (p.kadastraleGrootteWaarde/10000).toFixed(2) : '';
    const nv   = window.isNV ? 'Ja' : 'Nee';

    // (8h) Opslaan + lijst bijwerken
    selected.push({ feat, layer, naam, opp, grond, nv });
    renderParcelList();

  } catch(err) {
    console.error(err);
    alert(err.message);
  }
});

// (9) Start met lege lijst
renderParcelList();
