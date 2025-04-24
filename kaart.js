// kaart.js — WFS via Netlify Function proxy + RVO-grondsoort-classifier

const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

let marker;
const DEBUG = false;  // op true: altijd de raw-response loggen

/**
 * Reduceer ieder BRO-soilname naar één van de RVO-grondsoorten.
 */
function classifySoil(rawName) {
  if (!rawName) return 'Onbekend';
  const s = rawName.toLowerCase();
  if (s.includes('veen') || s.includes('peat'))      return 'Veen';
  if (s.includes('klei') || s.includes('clay'))      return 'Klei';
  if (s.includes('löss') || s.includes('loss') || s.includes('loess')) return 'Löss';
  if (s.includes('zand') || s.includes('sand'))      return 'Zand';
  return 'Onbekend';
}

map.on('click', async e => {
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);
  console.log('Klik op kaart:', e.latlng);

  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const proxyUrl = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
  console.log('Proxy WFS URL:', proxyUrl);

  try {
    const resp = await fetch(proxyUrl);
    const json = await resp.json();
    if (DEBUG) console.log('Raw BRO-response:', json);

    let base = 'Onbekend';
    if (json.features?.length) {
      const props = json.features[0].properties;
      // kies één van de velden die altijd aanwezig is
      const rawName = props.first_soilname 
                   || props.normal_soilprofile_name 
                   || props.bk06_naam 
                   || '';
      console.log('BRO naam:', rawName);
      base = classifySoil(rawName);
    }

    document.getElementById('grondsoort').value = base;
    window.huidigeGrond = base;

  } catch (err) {
    console.error('Fout bij proxy WFS:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }
});
