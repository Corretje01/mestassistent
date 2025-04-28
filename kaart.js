// kaart.js — multi‐parcel select/deselect met uitgebreide debug‐logging

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

// 2a) Array met alle geselecteerde percelen
//    ieder item: { layer: L.GeoJSON, cardId: string, geom: GeoJSON }
const selectedParcels = [];

map.on('click', async e => {
  // afgeronde click‐coördinaten
  const lon = parseFloat(e.latlng.lng.toFixed(6));
  const lat = parseFloat(e.latlng.lat.toFixed(6));
  const pt  = turf.point([lon, lat]);
  const parcelList = document.getElementById('parcelList');

  // 3a) Deselec­t: klik binnen bestaand polygon?
  for (let i = 0; i < selectedParcels.length; i++) {
    const { layer, cardId, geom } = selectedParcels[i];
    if (turf.booleanPointInPolygon(pt, geom)) {
      map.removeLayer(layer);
      document.getElementById(cardId)?.remove();
      selectedParcels.splice(i, 1);
      if (DEBUG) console.log('Deselected parcel', cardId);
      return;
    }
  }

  // 3b) Bodemsoort ophalen
  let rawSoil;
  try {
    const respSoil = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const pSoil    = await respSoil.json();
    if (!respSoil.ok) throw new Error(pSoil.error || respSoil.status);
    rawSoil = pSoil.grondsoort;
  } catch (err) {
    console.error('Bodem fout:', err);
    rawSoil = 'Onbekend';
  }
  const baseCat = getBaseCategory(rawSoil);

  // 3c) Perceel ophalen met strikt point-in-polygon server-filter
  let feat;
  try {
    const resp = await fetch(`/.netlify/functions/perceel?lon=${lon}&lat=${lat}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    if (!data.features?.[0]) {
      if (LIVE_ERRORS) alert('Geen perceel gevonden op deze locatie.');
      return;
    }
    feat = data.features[0];
  } catch (err) {
    console.error('Perceel fout:', err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
    return;
  }

  // 3d) Uitgebreide debug‐logging
  console.groupCollapsed('🔍 Debug parcel-selection');
  console.log('Click point:', [lon, lat]);
  console.log('Polygon ring coords:', feat.geometry.coordinates[0]);
  // bereken afstand tot elk hoekpunt (in graden)
  const distances = feat.geometry.coordinates[0].map(coord =>
    turf.distance(pt, turf.point(coord), { units: 'degrees' })
  );
  console.log('Min afstand tot hoekpunt (°):', Math.min(...distances));
  const contains = turf.booleanPointInPolygon(pt, feat.geometry);
  console.log('booleanPointInPolygon →', contains);
  console.groupEnd();

  if (!contains) {
    if (LIVE_ERRORS) alert('Klik viel net buiten de perceelsgrens. Bekijk console voor details.');
    return;
  }

  // 3e) Highlight perceel op de kaart
  const parcelLayer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(parcelLayer.getBounds());

  // 3f) Maak en toon card met perceel‐data
  const props = feat.properties;
  const naam = props.weergavenaam
    || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
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
        <input type="text" value="${window.isNV ? 'Ja' : 'Nee'}" readonly />
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

  // 3g) Voeg toe aan selectedParcels
  selectedParcels.push({
    layer: parcelLayer,
    cardId,
    geom: feat.geometry
  });

  if (DEBUG) console.log('Selected parcels:', selectedParcels);
});
