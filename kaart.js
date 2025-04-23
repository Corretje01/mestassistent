// kaart.js — WMS via Netlify Function proxy + raw XML debugging
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
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
    const data = await resp.json();
    console.log('Data via proxy:', data);
    console.log('Raw XML from proxy:', data.raw); // <-- Inspecteer hier de volledige XML

    // Zodra je weet welke tag de grondsoort bevat (bijv. <LABEL> of <soilarea_label>),
    // kun je de regex in je function daarop aanpassen en hier alleen data.grondsoort gebruiken.
    const grondsoort = data.grondsoort || 'Onbekend';
    document.getElementById('grondsoort').value = grondsoort;
    window.huidigeGrond = grondsoort;
  } catch (err) {
    console.error('Fout bij proxy WFS:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }
});
