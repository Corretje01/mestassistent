// kaart.js — met WMS-laag voor álle perceelsgrenzen + selectie-logic

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet init
const map = L.map('map').setView([52.1, 5.1], 7);

// 2a) OSM-tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2b) Kadaster kadastrale-perceelsgrenzen via WMS
L.tileLayer.wms('https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
  layers: 'perceel',
  format: 'image/png',
  transparent: true,
  version: '1.1.1',
  srs: 'EPSG:3857',
  attribution: '&copy; Kadaster'
}).addTo(map);

// Houd selecties bij
let selectedLayers = [];

// 3) Klik-handler voor selecteren / deselecteren
map.on('click', async e => {
  const { lat, lng } = e.latlng;

  // 3a) Eerst deselectie check: klik binnen een bestaand geoJSON-highlight?
  for (let i = 0; i < selectedLayers.length; i++) {
    const layer = selectedLayers[i];
    if (layer.getBounds().contains(e.latlng)) {
      map.removeLayer(layer);
      selectedLayers.splice(i, 1);
      // reset formulier
      document.getElementById('perceel').value = '';
      document.getElementById('grondsoort').value = '';
      document.getElementById('nvgebied').value = '';
      document.getElementById('hectare').value = '';
      return;
    }
  }

  // 3b) Bodemsoort ophalen
  let baseCat;
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lng}&lat=${lat}`);
    const p    = await resp.json();
    if (!resp.ok) throw new Error(p.error || resp.status);
    baseCat = getBaseCategory(p.grondsoort);
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
  } catch (err) {
    console.error('Bodem fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

  // 3c) WFS-perceel via proxy
  const proxyUrl = `/.netlify/functions/perceel?lon=${lng}&lat=${lat}`;
  if (DEBUG) console.log('🔗 Proxy-perceel URL →', proxyUrl);

  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);
    const feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden bij deze klik.');
      return;
    }

    // 3d) Highlight het nieuw geselecteerde perceel
    const geo = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    selectedLayers.push(geo);
    map.fitBounds(geo.getBounds());

    // 3e) Vul formulier met perceel-info
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
    console.error('Perceel fout bij ophalen:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
