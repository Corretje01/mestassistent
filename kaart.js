// kaart.js — WFS via Netlify Function proxy
const map = L.map('map').setView([52.1,5.1],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OSM contributors'
}).addTo(map);

let marker;
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
    const geojson = await resp.json();
    console.log('WFS via proxy:', geojson);

    if (geojson.features?.length) {
      const props = geojson.features[0].properties;
      console.log('Properties:', props);
      // Vaak is hier de sleutel bk06_naam
      const grondsoort = props.bk06_naam || props.grondsoortnaam || 'Onbekend';
      document.getElementById('grondsoort').value = grondsoort;
      window.huidigeGrond = grondsoort;
    } else {
      document.getElementById('grondsoort').value = 'Onbekend';
      window.huidigeGrond = 'Onbekend';
    }

  } catch (err) {
    console.error('Fout bij proxy WFS:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }
});
