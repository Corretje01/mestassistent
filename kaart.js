// kaart.js — volledig herschreven

// Schakel debugging en live-errors in/uit
const DEBUG = false;
const LIVE_ERRORS = true;

// 1) SoilMapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(json => soilMapping = json)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet-kaart init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// Houd meerdere geselecteerde percelen bij
const selectedParcels = new Map(); // key = feature.id, value = { layer, props }

// Helper: maak een form-groep voor elk perceel
function renderParcelForms() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';

  selectedParcels.forEach(({ props }, id) => {
    const naam = props.weergavenaam
      || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const oppHa = (props.kadastraleGrootteWaarde / 10000).toFixed(2);

    const html = `
      <div class="parcel-block" data-id="${id}">
        <h3>Perceel: ${naam}</h3>
        <p><strong>Grondsoort:</strong> ${window.huidigeGrond || '…'}</p>
        <p><strong>Oppervlakte:</strong> ${oppHa} ha</p>
        <label>Teelt
          <select class="gewas">
            <option value="mais">Maïs</option>
            <option value="tarwe">Tarwe</option>
            <option value="suikerbieten">Suikerbieten</option>
          </select>
        </label>
        <label>Derogatie
          <select class="derogatie">
            <option value="nee">Nee</option>
            <option value="ja">Ja</option>
          </select>
        </label>
        <button class="remove">Verwijder</button>
      </div>`;
    container.insertAdjacentHTML('beforeend', html);
  });

  // Remove-knoppen voorzien van event
  container.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.currentTarget.closest('.parcel-block').dataset.id;
      const { layer } = selectedParcels.get(id);
      map.removeLayer(layer);
      selectedParcels.delete(id);
      renderParcelForms();
    });
  });
}

// 3) Click-handler op de kaart
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 3a) Bodemsoort ophalen
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || resp.status);
    const cat = getBaseCategory(json.grondsoort);
    window.huidigeGrond = cat;
  } catch (err) {
    console.error('Bodem fout:', err);
    window.huidigeGrond = 'Onbekend';
  }

  // 3b) Perceel opvragen
  const proxy = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →', proxy);
  let feature;
  try {
    const resp = await fetch(proxy);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    feature = data.features?.[0];
    if (!feature) return; // geen perceel op deze plek
  } catch (err) {
    console.error('Perceel fout bij ophalen:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
    return;
  }

  // 3c) Check of deze feature al geselecteerd is
  const id = feature.id || JSON.stringify(feature.properties);
  if (selectedParcels.has(id)) {
    // Deselecteer
    const { layer } = selectedParcels.get(id);
    map.removeLayer(layer);
    selectedParcels.delete(id);
    renderParcelForms();
    return;
  }

  // 3d) Highlight nieuw perceel
  const layer = L.geoJSON(feature.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(layer.getBounds());

  // 3e) Opslaan en formulier updaten
  selectedParcels.set(id, { layer, props: feature.properties });
  renderParcelForms();
});
