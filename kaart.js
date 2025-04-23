// kaart.js — WMS via Netlify Function proxy met optionele debug-flag
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// Zet debug=true om bij elke klik de ruwe XML in de console te zien
const debug = true;

let marker;
map.on('click', async e => {
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  console.log('Klik op kaart:', e.latlng);
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  // Voeg &debug=true toe als debug aanstaat
  const proxyUrl = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}` +
                   (debug ? '&debug=true' : '');
  console.log('Proxy WMS URL:', proxyUrl);

  try {
    const resp = await fetch(proxyUrl);
    const data = await resp.json();
    console.log('Data via proxy:', data);
    if (debug) console.log('Raw XML (debug):', data.raw);

    // Vul het Grondsoort‐veld met de opgehaalde waarde
    const grondsoort = data.grondsoort || 'Onbekend';
    document.getElementById('grondsoort').value = grondsoort;
    window.huidigeGrond = grondsoort;
  } catch (err) {
    console.error('Fout bij proxy WMS:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }
});
