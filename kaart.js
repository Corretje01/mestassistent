// kaart.js — Meter-precisie multi-select met juiste axis-order

// Optioneel: debug-logs aan/uit
const DEBUG = false;

// 1) SoilMapping inladen voor bodemsoort-lookup
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json niet geladen:', err));

function getBaseCategory(rawName) {
  const entry = soilMapping.find(e => e.name === rawName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet-kaart initialiseren
const map = L.map('map').setView([52.1, 5.1], 8);

// 2a) OSM-tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2b) Kadaster-perceelsgrenzen als WMS-overlay
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers:      'kadastralekaart:Perceel',
  format:      'image/png',
  transparent: true,
  version:     '1.1.1',
  crs:         L.CRS.EPSG3857,
  attribution: '&copy; Kadaster via PDOK'
}).addTo(map);

// 3) Array om geselecteerde percelen in bij te houden
const selected = [];

// 4) Functie om de lijst onder de kaart bij te werken
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  selected.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${i+1}. ${p.name}</strong>
      <p>Opp: ${p.opp} ha · Bodem: ${p.grond} · NV: ${p.nv}</p>
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

// 5) Bodemsoort ophalen via proxy
async function fetchBodemsoort(lon, lat) {
  const res  = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
  if (!res.ok) throw new Error(`Bodemsoort API fout: ${res.status}`);
  const js = await res.json();
  return js.grondsoort || 'Onbekend';
}

// 6) Perceel-features ophalen direct bij PDOK WFS met BBOX + INTERSECTS
async function fetchPerceel(lon, lat) {
  // ±5 m delta in degrees
  const d    = 0.00005;
  const minX = parseFloat(lon) - d;
  const maxX = parseFloat(lon) + d;
  const minY = parseFloat(lat) - d;
  const maxY = parseFloat(lat) + d;

  // BBOX(xmin,ymin,xmax,ymax) + INTERSECTS(geometry,POINT(lat lon))
  const bbox      = `BBOX(geometry,${minX},${minY},${maxX},${maxY})`;
  const intersects= `INTERSECTS(geometry,POINT(${lat} ${lon}))`;
  const cql       = `${bbox} AND ${intersects}`;

  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '10',           // meerdere kandidaten
    CQL_FILTER:   cql
  });
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;
  if (DEBUG) console.log('WFS URL →', url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WFS fout: ${res.status}`);
  const js  = await res.json();
  return js.features || [];
}

// 7) Klik-handler voor multi-select/deselect
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const pt  = turf.point([parseFloat(lon), parseFloat(lat)]);

  // 7a) Deselection: klik binnen reeds geselecteerd perceel?
  const hitIndex = selected.findIndex(obj =>
    turf.booleanPointInPolygon(pt, obj.feat.geometry)
  );
  if (hitIndex !== -1) {
    map.removeLayer(selected[hitIndex].layer);
    selected.splice(hitIndex, 1);
    renderParcelList();
    return;
  }

  try {
    // 7b) Haal bodemsoort op en map naar categorie
    const rawSoil = await fetchBodemsoort(lon, lat);
    const grond   = getBaseCategory(rawSoil);

    // 7c) Haal candidate-features op
    const feats = await fetchPerceel(lon, lat);
    if (!feats.length) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }

    // 7d) Turf-filter voor definitieve selectie
    const exact = feats.filter(f =>
      turf.booleanPointInPolygon(pt, f.geometry)
    );
    const feat = exact.length ? exact[0] : feats[0];

    // 7e) Highlight op de kaart
    const layer = L.geoJSON(feat.geometry, {
      style: { color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    // 7f) Zoom alle geselecteerde in beeld
    const group = L.featureGroup(selected.map(o=>o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding:[20,20] });

    // 7g) Extract properties
    const p = feat.properties;
    const name = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde != null
               ? (p.kadastraleGrootteWaarde/10000).toFixed(2)
               : '';
    const nv   = window.isNV ? 'Ja' : 'Nee';

    // 7h) Opslaan en lijst renderen
    selected.push({ feat, layer, naam:name, opp, grond, nv });
    renderParcelList();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// 8) Initialiseer lege lijst
renderParcelList();
