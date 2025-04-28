// kaart.js — soilMapping + RVO-categorieën + Turf inside-check

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping
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

let parcelLayer = null;

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 2a) deselect if click binnen huidig perceel
  if (parcelLayer && parcelLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
    document.getElementById('perceel').value    = '';
    document.getElementById('hectare').value    = '';
    document.getElementById('grondsoort').value = '';
    document.getElementById('nvgebied').value   = '';
    return;
  }

  // 3) Haal bodemsoort
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

  // 4) Oude highlight verwijderen
  if (parcelLayer) {
    map.removeLayer(parcelLayer);
    parcelLayer = null;
  }

  // 5) Vang perceel via proxy-function
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →', proxyUrl);

  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);
    const feat = data.features?.[0];
    if (!feat) {
      // geen perceel
      return;
    }

    // 6) Turf: point-in-polygon check
    const pt   = turf.point([parseFloat(lon), parseFloat(lat)]);
    const poly = feat.geometry;
    const inside = turf.booleanPointInPolygon(
      pt,
      poly,
      { ignoreBoundary: false }
    );
    if (!inside) {
      alert('Klik viel net buiten de perceelsgrens. Probeer precies binnen te klikken.');
      return;
    }

    // 7) Highlight en invullen velden
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    const props = feat.properties;
    const naam  = props.weergavenaam
                  || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde; // in m2

    document.getElementById('perceel').value  = naam;
    document.getElementById('hectare').value  = opp != null
      ? (opp / 10000).toFixed(2)
      : '';
    document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';

  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
