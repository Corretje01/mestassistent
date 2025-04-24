// --- File: kaart.js ---
// Laadt data/soilMapping.json en gebruikt Netlify proxy om bodemsoort op te halen
let soilMap = {};
fetch("data/soilMapping.json")
  .then(r => r.json())
  .then(json => { soilMap = json; })
  .catch(err => console.error("Kon soilMapping.json niet laden:", err));

const map = L.map('map').setView([52.1,5.1],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OSM contributors'
}).addTo(map);

let marker;
map.on('click', async e => {
  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const url = `/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    let raw = 'Onbekend';
    if (data.features?.length) {
      const props = data.features[0].properties;
      raw = props.first_soilname || props.normal_soilprofile_name || props.bk06_naam || raw;
    }
    const cat = soilMap[raw] || 'U';

    document.getElementById('grondsoort').value = raw;
    window.huidigeGrond = cat;
    console.log(`Bodem: ${raw} → Categorie: ${cat}`);
  } catch (err) {
    console.error('Fout bij proxy:', err);
    document.getElementById('grondsoort').value = 'Fout bij ophalen';
    window.huidigeGrond = 'U';
  }
});
