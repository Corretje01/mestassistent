// kaart.js — soilMapping + RVO-categorieën + toggle parcel-selectie + Turf-check

const DEBUG = false;
const LIVE_ERRORS = true;

let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 1) Leaflet init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

let parcelLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 2) Deselect als binnen huidig perceel
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    document.getElementById('perceel').value    = '';
    document.getElementById('hectare').value    = '';
    document.getElementById('grondsoort').value = '';
    document.getElementById('nvgebied').value   = '';
    return;
  }

  // 3) Bodemsoort ophalen
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const p    = await resp.json();
    if (!resp.ok) throw new Error(p.error || resp.status);
    const baseCat = getBaseCategory(p.grondsoort);
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
  } catch (err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 4) Oude highlight weghalen
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

  // 5) Perceel via proxy-functie ophalen
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('🔗 Proxy-perceel URL:', proxyUrl);

  let feat;
  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);
    feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }
  } catch (err) {
    console.error('Perceel fout bij ophalen:', err);
    alert('Fout bij ophalen perceel.');
    return;
  }

  // 6) Turf-punt-in-polygon check
  // Bouw eerst een Turf-Polygon van de GeoJSON-coords:
  // feat.geometry.coordinates is [ [ [lng,lat], … ] ] voor één ring
  const turfPoly  = turf.polygon(feat.geometry.coordinates);
  const turfPoint = turf.point([parseFloat(lon), parseFloat(lat)]);

  if (!turf.booleanPointInPolygon(turfPoint, turfPoly)) {
    console.warn('⚠️ Turf check failed', feat.geometry.coordinates);
    alert('Klik viel net buiten de perceelgrens. Probeer nogmaals precies binnen te klikken.');
    return;
  }

  // 7) Highlight perceel
  parcelLayer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(parcelLayer.getBounds());

  // 8) Vul form-velden
  const props = feat.properties;
  const naam  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
  const opp   = props.kadastraleGrootteWaarde;

  document.getElementById('perceel').value  = naam;
  document.getElementById('hectare').value  = opp != null
    ? (opp / 10000).toFixed(2)
    : '';
  // NV-gebied invullen als window.isNV gedefinieerd zou zijn:
  document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';
});
