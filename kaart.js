// kaart.js — met achtergrond percelen via PDOK WMS

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) SoilMapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet init
const map = L.map('map').setView([52.1, 5.1], 12);

// 3) Onderliggende OSM-tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 4) **Achtergrond kadastrale percelen** via PDOK WMS
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'kadastralekaart:Perceel',
  format: 'image/png',
  transparent: true,
  version: '1.3.0',
  attribution: 'Kadaster via PDOK',
  // optioneel: lagere z-index zodat je GeoJSON-highlights er bovenop komen
  zIndex: 1
}).addTo(map);

let parcelLayer = null;

map.on('click', async e => {
  const { lng, lat } = e.latlng;
  const lon = lng.toFixed(6), latF = lat.toFixed(6);

  // 2a) Toggle deselect binnen highlight
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
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${latF}`);
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

  // 5) Percelen via proxy-function
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${latF}`;
  if (DEBUG) console.log('Proxy-perceel URL →', proxyUrl);

  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);
    const feat = data.features?.[0];
    if (!feat) {
      // geen perceel onder de klik
      alert('Klik viel net buiten de perceelsgrens. Probeer precies binnen te klikken.');
      return;
    }

    // 6) Highlight geselecteerd perceel
    parcelLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(parcelLayer.getBounds());

    // 7) Velden vullen
    const props = feat.properties;
    const naam  = props.weergavenaam
                  || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp   = props.kadastraleGrootteWaarde;

    document.getElementById('perceel').value  = naam;
    document.getElementById('hectare').value  = opp != null
      ? (opp / 10000).toFixed(2)
      : '';
    document.getElementById('nvgebied').value = window.isNV ? 'Ja' : 'Nee';

  } catch (err) {
    console.error('Perceel fout bij ophalen:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
