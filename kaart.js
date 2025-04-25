// kaart.js — met soilMapping integratie, RVO‑categorieën en debugging van perceeldata

// Zet DEBUG op true om extra logs te zien
tconst DEBUG = true;
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

  // **3) Bodemsoort opvragen**
  const bodemUrl = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;
  try {
    const resp = await fetch(bodemUrl);
    const payload = await resp.json();

    if (!resp.ok) {
      console.error(`Function returned status ${resp.status}`, payload);
      if (LIVE_ERRORS) console.error('Raw payload:', payload.raw ?? payload);
      document.getElementById('grondsoort').value = 'Fout bij ophalen';
      window.huidigeGrond = 'Onbekend';
      return;
    }

    const rawName = payload.grondsoort;
    const baseCat = getBaseCategory(rawName);

    if (DEBUG) {
      console.log('📦 Raw bodem payload:', payload.raw ?? payload);
      console.log(`Grondsoort (raw): ${rawName}, gespiegeld naar: ${baseCat}`);
    }

    document.getElementById('grondsoort').value = baseCat;
    window.huidigeGrond = baseCat;
  } catch (err) {
    console.error('Fetch bodem JSON failed:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'Onbekend';
  }

  // **4) Perceelinformatie opvragen via WFS v5 met CQL_FILTER**
  const wfsBase = 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0';
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'kadastralekaart:Perceel',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: '1',
    CQL_FILTER: `INTERSECTS(geometrie,POINT(${lon} ${lat}))`
  });
  const perceelUrl = `${wfsBase}?${params.toString()}`;

  // Log de URL
  if (DEBUG) console.log('🔗 Perceel WFS URL:', perceelUrl);

  try {
    const perceelResp = await fetch(perceelUrl);
    const perceelData = await perceelResp.json();

    // Log raw perceelData
    console.log('🗂 Raw perceelData:', perceelData);

    if (!perceelResp.ok) {
      console.error(`Perceel-service returned status ${perceelResp.status}`, perceelData);
      if (LIVE_ERRORS) console.error('Raw perceel payload:', perceelData);
      return;
    }

    const features = perceelData.features;
    if (!features || features.length === 0) {
      alert('Geen perceel gevonden op deze locatie.');
      return;
    }

    const p = features[0].properties;

    // Toon alle veldnamen en waarden voor debugging
    if (DEBUG) {
      console.log('🔍 Beschikbare perceel properties:');
      Object.entries(p).forEach(([key, value]) => console.log(`  • ${key}: ${value}`));
    }

    // Dynamische veldnamen bepalen op basis van what's available
    const oppField = ['kadastraleGrootteWaarde', 'oppervlakte'].find(f => p[f] !== undefined);
    const nummerField = ['perceelnummer', 'identificatie'].find(f => p[f] !== undefined);
    const sectieField = ['sectie'].find(f => p[f] !== undefined);
    const gemeenteField = ['kadastraleGemeentenaam', 'gemeentenaam'].find(f => p[f] !== undefined);

    const opp = oppField ? p[oppField] : undefined;
    const perceelNummer = nummerField ? p[nummerField] : 'unknown';
    const sectie = sectieField ? p[sectieField] : 'unknown';
    const gemeente = gemeenteField ? p[gemeenteField] : '';

    if (DEBUG) console.log(`📝 Gekozen fields → opp: ${oppField}, nummer: ${nummerField}, sectie: ${sectieField}, gemeente: ${gemeenteField}`);

    // Toon popup met de gevonden data
    alert(`Perceel: ${gemeente} ${sectie} ${perceelNummer}\nOppervlakte: ${opp ?? 'n.v.t.'} m²`);

    // Vul hectare-veld in
    if (opp) {
      document.getElementById('hectare').value = (opp / 10000).toFixed(2);
    }
  } catch (err) {
    console.error('Fout bij ophalen perceelinformatie:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceelinformatie.');
  }
});
