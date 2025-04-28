// kaart.js — Multi-select met BBOX + CQL-filter en Turf-verificatie

// Debug-flag: zet op true voor extra logs
const DEBUG = false;

// 1) Soil-mapping inladen (voor bodemsoort)
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(json => { soilMapping = json; })
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

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

// 2b) PDOK WMS voor kadastrale perceelsgrenzen
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'kadastralekaart:Perceel',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  crs: L.CRS.EPSG3857,
  attribution: '&copy; Kadaster via PDOK'
}).addTo(map);

// 3) State voor geselecteerde percelen
const selected = [];

// 4) Helper: render de lijst van geselecteerde percelen onder de kaart
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  selected.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'parcel-entry';
    div.innerHTML = `
      <strong>${i+1}. ${p.naam}</strong>
      <p>Opp: ${p.opp} ha &middot; Bodem: ${p.grond} &middot; NV: ${p.nv}</p>
      <button data-idx="${i}">🗑️ Verwijder</button>
    `;
    div.querySelector('button').addEventListener('click', () => {
      map.removeLayer(p.layer);
      selected.splice(i, 1);
      renderParcelList();
    });
    container.appendChild(div);
  });
}

// 5) Proxy‐calls

async function fetchPerceel(lon, lat) {
  // combineer BBOX (±5m) met CQL-filter via proxy
  const resp = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
  if (!resp.ok) throw new Error(`Perceel API error: ${resp.status}`);
  const json = await resp.json();
  return json.features || [];
}

async function fetchBodemsoort(lon, lat) {
  const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
  if (!resp.ok) throw new Error(`Bodemsoort API error: ${resp.status}`);
  const body = await resp.json();
  return body.grondsoort || 'Onbekend';
}

// 6) Klik-handler: selecteer/deselecteer percelen
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const pt  = turf.point([parseFloat(lon), parseFloat(lat)]);

  // 6a) Deselecteer als klik binnen bestaand perceel
  const hitIndex = selected.findIndex(o =>
    turf.booleanPointInPolygon(pt, o.feat.geometry)
  );
  if (hitIndex !== -1) {
    map.removeLayer(selected[hitIndex].layer);
    selected.splice(hitIndex, 1);
    renderParcelList();
    return;
  }

  try {
    // 6b) Bodemsoort ophalen
    const rawName = await fetchBodemsoort(lon, lat);
    const grond   = getBaseCategory(rawName);
    if (DEBUG) console.log('Bodemsoort:', rawName, '→', grond);

    // 6c) Perceel-features ophalen
    const feats = await fetchPerceel(lon, lat);
    if (!feats.length) {
      alert('Geen perceel gevonden op deze plek.');
      return;
    }

    // 6d) Filter met Turf voor exacte point-in-polygon
    const matches = feats.filter(f =>
      turf.booleanPointInPolygon(pt, f.geometry)
    );
    const feat = matches.length ? matches[0] : feats[0];

    // 6e) Highlight nieuw perceel
    const layer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);

    // 6f) Zoom naar alle geselecteerde + deze
    const group = L.featureGroup(selected.map(o => o.layer).concat(layer));
    map.fitBounds(group.getBounds(), { padding: [20, 20] });

    // 6g) Gegevens extraheren
    const props = feat.properties;
    const naam  = props.weergavenaam
                  || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde != null
                  ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
                  : '';
    const nv    = window.isNV ? 'Ja' : 'Nee';

    // 6h) Opslaan en lijst bijwerken
    selected.push({ feat, layer, naam, opp, grond, nv });
    renderParcelList();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// 7) Init lege lijst
renderParcelList();
