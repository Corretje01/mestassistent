// kaart.js

// === 0) Debug-flag ===
const DEBUG = false;

// === 1) Soil-mapping inladen voor bodemsoort ===
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json kon niet laden:', err));

function getBaseCategory(rawName) {
  const entry = soilMapping.find(e => e.name === rawName);
  return entry?.category || 'Onbekend';
}

// === 2) Leaflet-kaart init ===
const map = L.map('map').setView([52.1, 5.1], 8);

// OSM-achtergrond
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// PDOK WMS-laag kadastrale grenzen (EPSG:3857)
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'kadastralekaart:Perceel',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  crs: L.CRS.EPSG3857,
  attribution: '&copy; Kadaster via PDOK'
}).addTo(map);

// === 3) State voor geselecteerde percelen ===
const selected = [];

// Helper: render de lijst onder de kaart
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  selected.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${i+1}. ${p.naam}</strong>
      <p>Opp: ${p.opp} ha &middot; Bodem: ${p.grond}</p>
      <button data-idx="${i}">🗑️ Verwijder</button>
    `;
    div.querySelector('button')
       .addEventListener('click', () => {
         map.removeLayer(p.layer);
         selected.splice(i,1);
         renderParcelList();
       });
    container.appendChild(div);
  });
}

// === 4) Netlify-proxy calls ===
async function fetchPerceel(lon, lat) {
  const resp = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
  if (!resp.ok) throw new Error(`Perceel API: ${resp.status}`);
  const json = await resp.json();
  return json.features || [];
}

async function fetchBodemsoort(lon, lat) {
  const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
  if (!resp.ok) throw new Error(`Bodemsoort API: ${resp.status}`);
  const body = await resp.json();
  return body.grondsoort ?? 'Onbekend';
}

// === 5) Click-handler kaart ===
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  try {
    // 5a) Bereken Turf-punt
    const pt = turf.point([parseFloat(lon), parseFloat(lat)]);

    // 5b) Deselecteer als je binnen een bestaand perceel klikt
    const hit = selected.findIndex(o =>
      turf.booleanPointInPolygon(pt, o.feat.geometry)
    );
    if (hit !== -1) {
      map.removeLayer(selected[hit].layer);
      selected.splice(hit,1);
      renderParcelList();
      return;
    }

    // 5c) Bodemsoort ophalen
    let raw = await fetchBodemsoort(lon, lat);
    const grond = getBaseCategory(raw);
    if (DEBUG) console.log('Bodemsoort:', raw, '→', grond);

    // 5d) Perceel-features ophalen
    const features = await fetchPerceel(lon, lat);
    if (features.length === 0) {
      alert('Geen perceel gevonden op die plek.');
      return;
    }
    const feat = features[0];

    // 5e) Highlight perceel
    const layer = L.geoJSON(feat.geometry, {
      style: { color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);

    // 5f) Zoom naar alle geselecteerde
    const group = L.featureGroup(selected.map(o=>o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding:[20,20] });

    // 5g) Naam & opp. bepalen
    const props = feat.properties;
    const naam  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde != null
                ? (props.kadastraleGrootteWaarde/10000).toFixed(2)
                : '';

    // 5h) In state stoppen & render lijst
    selected.push({ feat, layer, naam, opp, grond });
    renderParcelList();

  } catch(err) {
    console.error(err);
    alert(err.message);
  }
});

// === 6) Init lege lijst ===
renderParcelList();
