// kaart.js — multi‐parcel select/deselect met proxy‐URL debug

// Zet DEBUG op true om alle URL’s en geometry‐checks te loggen
const DEBUG = true;
const LIVE_ERRORS = true;

// 1) Soil‐mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(res => res.json())
  .then(json => soilMapping = json)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

// Helper: RVO‐basis‐categorie bepalen uit raw bodem‐naam
function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet‐kaart init
const map = L.map('map').setView([52.1, 5.1], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OSM contributors'
}).addTo(map);

// 2a) Houd alle geselecteerde percelen bij
//    elk item = { layer: L.GeoJSON, cardId: string, geom: GeoJSON }
const selectedParcels = [];

// 3) Klik‐handler
map.on('click', async e => {
  // 3.1 Ronde coördinaten af op 6 decimalen
  const lon = parseFloat(e.latlng.lng.toFixed(6));
  const lat = parseFloat(e.latlng.lat.toFixed(6));
  const pt  = turf.point([lon, lat]);
  const parcelList = document.getElementById('parcelList');

  // 3.2 Deselec­t: kijk of je binnen een bestaand perceel klikt
  for (let i = 0; i < selectedParcels.length; i++) {
    const { layer, cardId, geom } = selectedParcels[i];
    if (turf.booleanPointInPolygon(pt, geom)) {
      // Verwijder highlight en bijbehorende card
      map.removeLayer(layer);
      document.getElementById(cardId)?.remove();
      selectedParcels.splice(i, 1);
      if (DEBUG) console.log(`🔸 Deselected parcel ${cardId}`);
      return;
    }
  }

  // 3.3 Bodemsoort ophalen
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

  // 3.4 Bouw en log de proxy‐URL voor perceel‐fetch
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('🌐 Proxy-perceel URL →', proxyUrl);

  // 3.5 Perceel ophalen via Netlify‐proxy
  let feat;
  try {
    const resp = await fetch(proxyUrl);
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

  // 3.6 Uitgebreide debug‐logging: ring‐coords, afstand en contains
  console.groupCollapsed('🔍 Debug parcel-selection');
  console.log('Click point:', [lon, lat]);
  console.log('Polygon ring coords:', feat.geometry.coordinates[0]);
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

  // 3.7 Highlight het perceel op de kaart
  const parcelLayer = L.geoJSON(feat.geometry, {
    style: { color: '#1e90ff', weight: 2, fillOpacity: 0.2 }
  }).addTo(map);
  map.fitBounds(parcelLayer.getBounds());

  // 3.8 Maak een card voor dit perceel
  const props = feat.properties;
  const naam  = props.weergavenaam
    || `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
  const oppHa = props.kadastraleGrootteWaarde != null
    ? (props.kadastraleGrootteWaarde / 10000).toFixed(2)
    : '';

  const cardId = `parcel-${Date.now()}`;
  const card   = document.createElement('div');
  card.className = 'parcel-card';
  card.id        = cardId;
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

  // 3.9 Sla op in selectedParcels
  selectedParcels.push({
    layer: parcelLayer,
    cardId,
    geom: feat.geometry
  });

  if (DEBUG) console.log('✅ Selected parcels:', selectedParcels);
});
