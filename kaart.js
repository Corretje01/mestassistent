// kaart.js — stap 2: basis voor multi‐select met dummy‐cards,
// mét behoud van je bestaande structuur (soilMapping, map‐init, enz.)

// DEBUG- en error‐flags
const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil‐mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

// Helper: RVO‐basis‐categorie bepalen
function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet‐kaart init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2a) Array met alle geselecteerde percelen (stap 2)
const selectedParcels = [];

// 3) Klik‐handler (nu alleen dummy‐cards; echte logica volgt in stap 3)
map.on('click', e => {
  const parcelList = document.getElementById('parcelList');

  // Unieke ID voor deze selectie
  const id = `dummy-${Date.now()}`;

  // Opslaan in de array
  selectedParcels.push({ id });

  // Bouw een eenvoudige card
  const card = document.createElement('div');
  card.className = 'parcel-card';
  card.id = id;
  card.innerHTML = `
    <h3>Dummy perceel ${selectedParcels.length}</h3>
    <p>Kaartje #${selectedParcels.length} in de lijst.</p>
  `;
  parcelList.appendChild(card);

  if (DEBUG) console.log('selectedParcels:', selectedParcels);
});
