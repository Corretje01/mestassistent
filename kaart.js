// kaart.js — stap 2: basis voor multi-select met dummy-cards

// 1) Declaratie van de array die straks alle geselecteerde percelen gaat bijhouden
const selectedParcels = [];

// 2) Leaflet-kaart init (ongewijzigd)
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 3) Klik-handler: voeg nu een dummy-card toe aan #parcelList
map.on('click', e => {
  const parcelList = document.getElementById('parcelList');

  // Maak een unieke ID voor dit dummy-item
  const id = `dummy-${Date.now()}`;
  selectedParcels.push({ id });

  // Maak de dummy-card DOM-element
  const card = document.createElement('div');
  card.className = 'parcel-card';
  card.id = id;
  card.innerHTML = `
    <h3>Dummy perceel ${selectedParcels.length}</h3>
    <p>Dit is kaartje #${selectedParcels.length} in de lijst.</p>
  `;
  parcelList.appendChild(card);

  console.log('selectedParcels:', selectedParcels);
});
