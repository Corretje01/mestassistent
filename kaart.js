// kaart.js — stap 2b: dummy‐cards met toggle op dezelfde locatie

// DEBUG‐flag
const DEBUG = false;

// 1) Array waarin we elk geselecteerd “dummy‐perceel” bijhouden
//    We slaan { id, lat, lon } op om toggling op coords te kunnen doen
const selectedParcels = [];

// 2) Leaflet‐kaart init (ongewijzigd)
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 3) Klik‐handler met toggle‐logica
map.on('click', e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const parcelList = document.getElementById('parcelList');

  // Kijk of we al een dummy hebben op exact deze coords
  const existingIndex = selectedParcels.findIndex(p => p.lat === lat && p.lon === lon);

  if (existingIndex !== -1) {
    // Deselec­t: verwijder kaart en card
    const toRemove = selectedParcels[existingIndex];
    // DOM verwijderen
    const cardEl = document.getElementById(toRemove.id);
    if (cardEl) parcelList.removeChild(cardEl);
    // Array bijwerken
    selectedParcels.splice(existingIndex, 1);
    if (DEBUG) console.log(`Deselected dummy at ${lat},${lon}`, selectedParcels);
    return;
  }

  // Nieuw: we selecteren een dummy‐perceel
  const id = `dummy-${Date.now()}`;
  selectedParcels.push({ id, lat, lon });

  // Maak de dummy‐card
  const card = document.createElement('div');
  card.className = 'parcel-card';
  card.id = id;
  card.innerHTML = `
    <h3>Dummy perceel</h3>
    <p>Locatie: ${lat}, ${lon}</p>
    <p>Kaartje #${selectedParcels.length}</p>
  `;
  parcelList.appendChild(card);

  if (DEBUG) console.log('Selected parcels:', selectedParcels);
});
