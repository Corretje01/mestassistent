// kaart.js — met soilMapping integratie, RVO-categorieën en dynamische perceeldata via WFS v5

// Zet DEBUG op true om extra logs te zien
const DEBUG = true;
const LIVE_ERRORS = true;

// **1) Soil-mapping inladen**
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

/**
 * Haal de RVO-basis-categorie op uit de raw BRO-naam.
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
  // Marker plaatsen
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // **3) Bodemsoort opvragen**
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const payload = await resp.json();
    if (!resp.ok) throw new Error(`Status ${resp.status}`);
    const baseCat = getBaseCategory(payload.grondsoort);
    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
    if (DEBUG) console.log('Bodemsoort:', payload.grondsoort, '→', baseCat);
  } catch (err) {
    console.error('Bodemsoort fout:', err);
    document.getElementById('grondsoort').value = 'Fout';
    window.huidigeGrond = 'Onbekend';
  }

    // **4) Perceelinformatie opvragen via INSPIRE WFS v1_0**
  const wfsBase = 'https://service.pdok.nl/kadaster/cp/wfs/v1_0';
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeNames: 'Perceel',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: '1',
    CQL_FILTER: `INTERSECTS(geometry,POINT(${lon} ${lat}))`
  });
  const perceelUrl = `${wfsBase}?${params.toString()}`;
  if (DEBUG) console.log('🔗 INSPIRE WFS URL:', perceelUrl);

  try {
    const resp = await fetch(perceelUrl);
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Status ${resp.status}`);
    if (!data.features.length) {
      alert('Geen perceel gevonden op deze locatie (INSPIRE).');
      return;
    }

    const p = data.features[0].properties;
    if (DEBUG) console.log('🔍 INSPIRE perceel properties:', p);

    // Kies je velden
    const opp = p.kadastraleGrootteWaarde;
    const nummer = p.perceelnummer || p.identificatieLokaalID;
    const sectie = p.sectie;
    const gemeente = p.kadastraleGemeenteWaarde;

    alert(`Perceel: ${gemeente} ${sectie} ${nummer}\nOppervlakte: ${opp} m²`);
    if (opp) document.getElementById('hectare').value = (opp / 10000).toFixed(2);
  } catch (err) {
    console.error('INSPIRE perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen INSPIRE-perceelinfo.');
  }
});
