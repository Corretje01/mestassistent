// kaart.js — WFS via Netlify Function proxy met gefinetunde logging

// Zet DEBUG op true als je bij succes de volledige raw-payload wilt zien
const DEBUG = false;

// Zet LIVE_ERRORS op true om bij elke HTTP-error de raw payload te tonen
const LIVE_ERRORS = true;

const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

let marker;
map.on('click', async e => {
  // Verwijder oude marker en zet een nieuwe
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const url = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;

  try {
    const resp = await fetch(url);
    const payload = await resp.json();

    // HTTP-error van de Function zelf
    if (!resp.ok) {
      console.error(`Function returned status ${resp.status}`, payload);
      if (LIVE_ERRORS) {
        console.error('Raw payload:', payload.raw ?? payload);
      }
      document.getElementById('grondsoort').value = 'Fout bij ophalen';
      window.huidigeGrond = 'Onbekend';
      return;
    }

    // Succesvolle response
    if (DEBUG) {
      console.log('RAW response:', payload.raw ?? payload);
    } else {
      console.log('Grondsoort:', payload.grondsoort);
    }

    document.getElementById('grondsoort').value = payload.grondsoort;
    window.huidigeGrond = payload.grondsoort;

  } catch (err) {
    // Network- of JSON-parsefout
    console.error('Fetch of JSON failed:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }
});
