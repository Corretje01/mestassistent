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

  // **4) Perceel opvragen via PDOK Locatieserver**
const lsUrl = new URL('https://geodata.nationaalgeoregister.nl/locatieserver/v3/free');
lsUrl.search = new URLSearchParams({
  fq: 'type:perceel',
  lat: lat,
  lon: lon,
  rows: '1',
  fl: 'weergavenaam,kadastrale_grootte_waarde,perceelnummer,sectie',
  wt: 'json'
});

if (DEBUG) console.log('🔗 Locatieserver URL:', lsUrl.toString());

try {
  const lsResp = await fetch(lsUrl);
  const lsData = await lsResp.json();
  const doc = lsData.response?.docs?.[0];
  if (!doc) {
    alert('Geen perceel gevonden op deze locatie.');
    return;
  }

  // weergavenaam komt in de vorm “Teteringen A 23”
  const [weergavenaam, sectiePlusNummer] = (doc.weergavenaam||'').split(' ');
  const sectie = doc.sectie || '';
  const nummer = doc.perceelnummer || '';
  const opp = doc.kadastrale_grootte_waarde;

  alert(
    `Perceel: ${weergavenaam} ${sectie} ${nummer}\n` +
    `Oppervlakte: ${opp ?? 'n.v.t.'} m²`
  );
  if (opp) {
    document.getElementById('hectare').value = (opp/10000).toFixed(2);
  }
} catch(err) {
  console.error('Locatieserver fout:', err);
  if (LIVE_ERRORS) alert('Fout bij ophalen perceel via Locatieserver.');
}
});
