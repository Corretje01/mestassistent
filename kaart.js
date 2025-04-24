// kaart.js — met soilMapping integratie en RVO‐categorieën

// Zet DEBUG op true als je bij succes de volledige raw-payload wilt zien
const DEBUG = false;
// Zet LIVE_ERRORS op true om bij elke HTTP-error de raw payload te tonen
const LIVE_ERRORS = true;

// **1) Soil-mapping inladen**
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

/**
 * Haal de RVO-basis-categorie op uit de raw BRO-naam.
 * Retourneert 'Zand', 'Klei', 'Veen', 'Löss' of 'Onbekend'.
 */
function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// **2) Leaflet-kaart init**
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

let marker;
map.on('click', async e => {
  // Verwijder oude marker en zet een nieuwe neer
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const url = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;

  try {
    const resp = await fetch(url);
    const payload = await resp.json();

    // 3) Fout-afhandeling van de Function zelf
    if (!resp.ok) {
      console.error(`Function returned status ${resp.status}`, payload);
      if (LIVE_ERRORS) console.error('Raw payload:', payload.raw ?? payload);
      document.getElementById('grondsoort').value = 'Fout bij ophalen';
      window.huidigeGrond = 'Onbekend';
      return;
    }

    // 4) Succesvolle response → bepaal basis-categorie
    const rawName = payload.grondsoort;
    const baseCat = getBaseCategory(rawName);

    if (DEBUG) {
      console.log('RAW response:', payload.raw ?? payload);
      console.log(`Origineel: ${rawName}`);
    }
    console.log(`Grondsoort: ${rawName} → Basis-categorie: ${baseCat}`);

    // 5) Toon de eenvoudige RVO-categorie
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;

  } catch (err) {
    // Network- of JSON-parsefout
    console.error('Fetch of JSON failed:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }
});
