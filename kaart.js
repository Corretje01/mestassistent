// kaart.js — Precisieselectie via directe WFS + Turf-validatie

// (optioneel) debug-logs
const DEBUG = false;

// 1) SoilMapping inladen voor bodemsoort
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json niet geladen:', err));

function getBaseCategory(rawName) {
  const entry = soilMapping.find(e => e.name === rawName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet-kaart init
const map = L.map('map').setView([52.1,5.1],8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OSM contributors'
}).addTo(map);

// 2b) PDOK WMS-laag kadastrale grenzen (achtergrondlijnen)
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0',{
  layers:        'kadastralekaart:Perceel',
  format:        'image/png',
  transparent:   true,
  version:       '1.1.1',
  crs:           L.CRS.EPSG3857,
  attribution:   '&copy; Kadaster via PDOK'
}).addTo(map);

// 3) State voor geselecteerde percelen
const selected = [];

// Helper: update de HTML-lijst onder de kaart
function renderParcelList(){
  const ul = document.getElementById('parcelList');
  ul.innerHTML = '';
  selected.forEach((p,i) => {
    const li = document.createElement('div');
    li.className = 'parcel-entry';
    li.innerHTML = `
      <strong>${i+1}. ${p.naam}</strong>
      <p>Opp: ${p.opp} ha · Bodem: ${p.grond} · NV: ${p.nv}</p>
      <button data-idx="${i}">🗑 Verwijder</button>
    `;
    li.querySelector('button').onclick = () => {
      map.removeLayer(p.layer);
      selected.splice(i,1);
      renderParcelList();
    };
    ul.appendChild(li);
  });
}

// 4) Ophalen van perceels-features via INTERSECTS + BBOX
async function fetchPerceel(lon, lat){
  // ±5 m in decimal degrees
  const d = 0.00005;
  const minX = parseFloat(lon) - d;
  const maxX = parseFloat(lon) + d;
  const minY = parseFloat(lat) - d;
  const maxY = parseFloat(lat) + d;

  // Axis-order lat lon voor WFS 2.0!
  const cql = [
    `BBOX(geometry,${minX},${minY},${maxX},${maxY})`,
    `INTERSECTS(geometry,POINT(${lat}%20${lon}))`
  ].join(' AND ');

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
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;

  if(DEBUG) console.log('WFS URL:', url);
  const res  = await fetch(url);
  if(!res.ok) throw new Error(`WFS error ${res.status}`);
  const json = await res.json();
  return json.features || [];
}

// 5) Ophalen van bodemsoort via proxy
async function fetchBodemsoort(lon, lat){
  const res = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
  if(!res.ok) throw new Error(`Bodemsoort API ${res.status}`);
  const body = await res.json();
  return body.grondsoort || 'Onbekend';
}

// 6) Click-handler : multi-select / deselect
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6),
        lat = e.latlng.lat.toFixed(6),
        pt  = turf.point([parseFloat(lon), parseFloat(lat)]);

  // 6a) deselect als binnen bestaand perceel
  const hit = selected.findIndex(o =>
    turf.booleanPointInPolygon(pt, o.feat.geometry)
  );
  if(hit !== -1){
    map.removeLayer(selected[hit].layer);
    selected.splice(hit,1);
    renderParcelList();
    return;
  }

  try {
    // 6b) bodemsoort ophalen
    const raw = await fetchBodemsoort(lon, lat);
    const grond = getBaseCategory(raw);

    // 6c) perceelsdata ophalen
    const feats = await fetchPerceel(lon, lat);
    if(!feats.length){
      alert('Geen perceel gevonden.');
      return;
    }

    // 6d) Turf-filter voor écht binnen
    const inPoly = feats.filter(f =>
      turf.booleanPointInPolygon(pt, f.geometry)
    );
    const feat = inPoly.length ? inPoly[0] : feats[0];

    // 6e) highlight toevoegen
    const layer = L.geoJSON(feat.geometry, {
      style:{ color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    // 6f) zoom naar alle geselecteerde
    const group = L.featureGroup(selected.map(o=>o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding:[20,20] });

    // 6g) eigenschappen
    const p = feat.properties;
    const naam = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde != null
               ? (p.kadastraleGrootteWaarde/10000).toFixed(2) : '';
    const nv   = window.isNV ? 'Ja' : 'Nee';

    // 6h) state + UI
    selected.push({ feat, layer, naam, opp, grond, nv });
    renderParcelList();

  } catch(err) {
    console.error(err);
    alert(err.message);
  }
});

// 7) init lege lijst
renderParcelList();
