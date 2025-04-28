// kaart.js — Leaflet + Turf + Netlify-proxy voor perceelsselectie

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping laden
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// Huidige selectie-layer
let parcelLayer = null;

map.on('click', async e => {
  const [lon, lat] = [e.latlng.lng.toFixed(6), e.latlng.lat.toFixed(6)];

  // 2a) Deselect: klik binnen huidig perceel
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    clearFields();
    return;
  }

  // 3) Bodemsoort bepalen
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const p    = await resp.json();
    if (!resp.ok) throw new Error(p.error || resp.status);
    const cat  = getBaseCategory(p.grondsoort);
    document.getElementById('grondsoort').value = cat;
    window.huidigeGrond = cat;
  } catch (err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 4) Verwijder vorige highlight
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    clearFields();
  }

  // 5) Haal perceel op via Netlify-proxy
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('🔗 Proxy-perceel URL:', proxyUrl);

  let geojson;
  try {
    const r    = await fetch(proxyUrl);
    geojson    = await r.json();
    if (!r.ok) throw new Error(geojson.error || `Status ${r.status}`);
  } catch (err) {
    console.error('Perceel fout bij ophalen:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
    return;
  }

  const feat = geojson.features?.[0];
  if (!feat) {
    alert('Geen perceel gevonden op deze locatie.');
    return;
  }

  // 6) Turf-check: echt binnen perceel?
  const pt     = turf.point([+lon, +lat]);
  const poly   = turf.polygon(feat.geometry.coordinates);
  const inside = turf.booleanPointInPolygon(pt, poly);
  if (!inside) {
    console.warn('⚠ Turf check failed', feat.geometry.coordinates[0]);
    alert('Klik viel net buiten de perceelgrens. Probeer opnieuw.');
    return;
  }

  // 7) Highlight en invullen
  parcelLayer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(parcelLayer.getBounds());

  fillFields(feat.properties);
});

// Hulpfuncties

function clearFields() {
  ['perceel','hectare','grondsoort','nvgebied']
    .forEach(id => document.getElementById(id).value = '');
}

function fillFields(props) {
  const naam = props.weergavenaam
    || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
  const opp  = props.kadastraleGrootteWaarde;

  document.getElementById('perceel').value  = naam;
  document.getElementById('nvgebied').value = (props.inbrenggebiedCode ? 'Ja' : 'Nee');
  document.getElementById('hectare').value  = opp != null
    ? (opp / 10000).toFixed(2)
    : '';
}
