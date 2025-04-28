// kaart.js — volledige, nieuwe versie

// Toggle voor extra logging
const DEBUG = true;
const LIVE_ERRORS = true;

// 1) SoilMapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

// Helper om te mappen naar Zand/Klei/Veen/Löss
function getBaseCategory(raw) {
  const entry = soilMapping.find(e => e.name === raw);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet-kaart init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// Track de huidige highlight-layer
let parcelLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 2a) Deselec­t: klik binnen huidig perceel
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    ['perceel','hectare','grondsoort','nvgebied'].forEach(id => {
      document.getElementById(id).value = '';
    });
    return;
  }

  // 3) Bodemsoort ophalen
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const p    = await resp.json();
    if (!resp.ok) throw new Error(p.error || resp.status);
    const cat = getBaseCategory(p.grondsoort);
    document.getElementById('grondsoort').value = cat;
    window.huidigeGrond = cat;
  } catch (err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 4) Oude highlight verwijderen
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

  // 5) Vraag perceel op via jouw Netlify-proxy
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('▶ Proxy-perceel URL →', proxyUrl);

  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);

    // **ZEER BELANGRIJK**: hier zie je de échte PDOK-call
    if (DEBUG && data.debugUrl) {
      console.log('▶ PDOK WFS URL: ', data.debugUrl);
    }

    const feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }

    // 6) Highlight polygon
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    // 7) Vul velden in
    const props = feat.properties;
    const naam  = props.weergavenaam
                  || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde; // m²

    document.getElementById('perceel').value    = naam;
    document.getElementById('hectare').value    = opp != null
      ? (opp / 10000).toFixed(2)
      : '';
    document.getElementById('nvgebied').value   = window.isNV ? 'Ja' : 'Nee';

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
