// kaart.js — direct PDOK-WFS + Turf check

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

// Leaflet init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

let parcelLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Deselec­te als je binnen huidig perceel klikt
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    ['perceel','hectare','grondsoort','nvgebied'].forEach(id => {
      document.getElementById(id).value = '';
    });
    return;
  }

  // Haal bodemsoort op
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

  // Verwijder oude highlight
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

  // Bouw PDOK WFS-URL (direct, zonder proxy)
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '1',
    CQL_FILTER:   `CONTAINS(geometry,POINT(${lon}+${lat}))`
  });
  const wfsUrl = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?${params}`;
  if (DEBUG) console.log('▶ PDOK WFS URL:', wfsUrl);

  let feat;
  try {
    const r    = await fetch(wfsUrl, { mode: 'cors' });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
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

  // Turf-check: punt in polygon?
  const turfPoly  = turf.polygon(feat.geometry.coordinates);
  const turfPoint = turf.point([+lon, +lat]);
  if (!turf.booleanPointInPolygon(turfPoint, turfPoly)) {
    console.warn('⚠️ Turf check failed', feat.geometry.coordinates);
    alert('Klik viel net buiten de perceelgrens. Probeer nogmaals precies binnen te klikken.');
    return;
  }

  // Highlight perceel & zoom
  parcelLayer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(parcelLayer.getBounds());

  // Velden vullen
  const props = feat.properties;
  const naam  = props.weergavenaam
                || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
  const opp   = props.kadastraleGrootteWaarde;

  document.getElementById('perceel').value  = naam;
  document.getElementById('hectare').value  = opp != null
    ? (opp / 10000).toFixed(2)
    : '';
  document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';
});
