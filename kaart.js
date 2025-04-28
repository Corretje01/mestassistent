// kaart.js

// Optioneel voor debug-logs:
const DEBUG = false;

let map = L.map('map').setView([52.1, 5.1], 8);

// 1) OSM-achtergrond
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2) PDOK WMS voor kadastrale grenzen
const kadasterWms = L.tileLayer.wms(
  'https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0', {
    layers: 'kadastralekaart:Perceel',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    SRS: 'EPSG:3857',
    attribution: '&copy; Kadaster via PDOK'
  }
).addTo(map);

// 3) Geometrie-highlight
let highlightLayer = null;

// 4) Proxy-functie perceel (WFS via Netlify)
async function fetchPercelen(lon, lat) {
  const url = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Perceel fout: ${res.status}`);
  return res.json();
}

// 5) Click-handler
map.on('click', async e => {
  const [lon, lat] = [e.latlng.lng.toFixed(6), e.latlng.lat.toFixed(6)];

  // Deselection: klik binnen de huidige highlight
  if (highlightLayer && highlightLayer.getBounds().contains(e.latlng)) {
    map.removeLayer(highlightLayer);
    highlightLayer = null;
    document.getElementById('perceel').value = '';
    document.getElementById('hectare').value = '';
    document.getElementById('grondsoort').value = '';
    document.getElementById('nvgebied').value = '';
    return;
  }

  try {
    // Perceel via proxy
    const data = await fetchPercelen(lon, lat);
    const feat = data.features?.[0];
    if (!feat) {
      alert('Geen perceel gevonden op deze plek.');
      return;
    }

    // Highlight
    if (highlightLayer) map.removeLayer(highlightLayer);
    highlightLayer = L.geoJSON(feat.geometry, {
      style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
    }).addTo(map);
    map.fitBounds(highlightLayer.getBounds());

    // Vul form-velden
    const p = feat.properties;
    const naam = p.weergavenaam
               || `${p.kadastraleGemeenteWaarde} ${p.sectie} ${p.perceelnummer}`;
    const opp  = p.kadastraleGrootteWaarde;
    document.getElementById('perceel').value    = naam;
    document.getElementById('hectare').value    = opp!=null ? (opp/10000).toFixed(2) : '';
    document.getElementById('grondsoort').value = window.huidigeGrond || '';
    document.getElementById('nvgebied').value   = window.isNV ? 'Ja' : 'Nee';

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});
