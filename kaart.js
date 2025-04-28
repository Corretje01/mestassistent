// kaart.js — soilMapping + RVO-categorieën + multi-parcel select/deselect

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(j => soilMapping = j)
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

// 2a) Houd alle geselecteerde percelen bij
//    ieder item: { layer: L.GeoJSON, cardId: string }
const selectedParcels = [];

// 3) Klik-handler: toggle deselect of nieuwe selectie
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);
  const parcelList = document.getElementById('parcelList');

  // 3a) Deselect: klik binnen bestaand perceel?
  for (let i = 0; i < selectedParcels.length; i++) {
    const { layer, cardId } = selectedParcels[i];
    if (layer.getBounds().contains(e.latlng)) {
      // Verwijder laag en kaartje
      map.removeLayer(layer);
      document.getElementById(cardId)?.remove();
      selectedParcels.splice(i, 1);
      if (DEBUG) console.log('Deselected parcel', cardId);
      return;
    }
  }

  // 3b) Nieuwe selectie: bodemsoort ophalen
  let rawSoil;
  try {
    const respSoil = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const pSoil = await respSoil.json();
    if (!respSoil.ok) throw new Error(pSoil.error || respSoil.status);
    rawSoil = pSoil.grondsoort;
  } catch (err) {
    console.error('Bodem fout:', err);
    rawSoil = 'Onbekend';
  }
  const baseCat = getBaseCategory(rawSoil);

  // 3c) Perceel ophalen via proxy‐function
  let feat;
  try {
    const resp = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    feat = data.features?.[0];
    if (!feat) return;  // geen perceel hier
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
    return;
  }

  // 3d) Highlight perceellayer
  const parcelLayer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(parcelLayer.getBounds());

  // 3e) Maak een kaartje voor dit perceel
  const props = feat.properties;
  const naam = props.weergavenaam || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
  const oppHa = props.kadastraleGrootteWaarde != null
    ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
    : '';

  const cardId = `parcel-${Date.now()}`;
  const card = document.createElement('div');
  card.className = 'parcel-card';
  card.id = cardId;
  card.innerHTML = `
    <h3>${naam}</h3>
    <div class="card-grid">
      <div>
        <label>Grondsoort</label>
        <input type="text" value="${baseCat}" readonly />
      </div>
      <div>
        <label>Oppervlakte (ha)</label>
        <input type="text" value="${oppHa}" readonly />
      </div>
      <div>
        <label>NV-gebied?</label>
        <input type="text" value="${window.isNV ? 'Ja':'Nee'}" readonly />
      </div>
      <div>
        <label>Teelt</label>
        <select>
          <option value="mais">Maïs</option>
          <option value="tarwe">Tarwe</option>
          <option value="suikerbieten">Suikerbieten</option>
        </select>
      </div>
      <div>
        <label>Derogatie</label>
        <select>
          <option value="nee">Nee</option>
          <option value="ja">Ja</option>
        </select>
      </div>
    </div>
  `;
  parcelList.appendChild(card);

  // 3f) Voeg toe aan array
  selectedParcels.push({ layer: parcelLayer, cardId });

  if (DEBUG) console.log('Selected parcels:', selectedParcels);
});
