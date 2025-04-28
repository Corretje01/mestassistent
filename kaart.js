// kaart.js — volledig herschreven

// Zet DEBUG=false zodra alles werkt
const DEBUG = true;
const LIVE_ERRORS = true;

// 1) SoilMapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ soilMapping.json error:', err));

function getBaseCategory(rawName) {
  const entry = soilMapping.find(e => e.name === rawName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet-kaart init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

let currentLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 2a) Deselect als je binnen huidig polygon klikt
  if (currentLayer && currentLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(currentLayer);
    currentLayer = null;
    ['perceel','hectare','grondsoort','nvgebied'].forEach(id => 
      document.getElementById(id).value = ''
    );
    return;
  }

  // 3) Bodemsoort ophalen
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || resp.status);
    const cat = getBaseCategory(json.grondsoort);
    document.getElementById('grondsoort').value = cat;
    window.huidigeGrond = cat;
  } catch(err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 4) Oude highlight weg
  if (currentLayer) {
    map.removeLayer(currentLayer);
    currentLayer = null;
  }

  // 5) Bouw PDOK-WFS URL met CQL_FILTER
  const base = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const cql  = `CONTAINS(geometry,POINT(${lon} ${lat}))`;
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    count:        '1',
    CQL_FILTER:   cql
  });
  const wfsUrl = `${base}?${params.toString()}`;

  if (DEBUG) {
    console.log('▶ PDOK WFS URL:', wfsUrl);
  }

  // 6) Fetch en highlight
  try {
    const r    = await fetch(wfsUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);

    const feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }

    // 7) Extra check: echt binnen poly (Turf)
    const pt     = turf.point([parseFloat(lon), parseFloat(lat)]);
    const poly   = turf.polygon(feat.geometry.coordinates);
    const inside = turf.booleanPointInPolygon(pt, poly);

    if (!inside) {
      alert('Klik viel net buiten de perceelgrens. Probeer nogmaals precies binnen te klikken.');
      if (DEBUG) console.log('⚠️ Turf check failed', feat.geometry.coordinates[0]);
      return;
    }

    // 8) Toon polygon
    currentLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(currentLayer.getBounds());

    // 9) Velden invullen
    const p = feat.properties;
    const name = p.weergavenaam
      || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const areaM2 = p.kadastraleGrootteWaarde;
    const areaHa = areaM2 != null
      ? (areaM2 / 10000).toFixed(2)
      : '';

    document.getElementById('perceel').value  = name;
    document.getElementById('hectare').value  = areaHa;
    document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';

  } catch(err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
