// kaart.js — soilMapping + RVO-categorieën + multi-perceel selectie

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil-mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));

function getBaseCategory(soilName) {
  const entry = soilMapping.find(e => e.name === soilName);
  return entry?.category || 'Onbekend';
}

// 2) Leaflet-init
const map = L.map('map').setView([52.1,5.1],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OSM contributors'
}).addTo(map);

// Hou geselecteerde percelen bij
let selectedParcels = [];

// Helper om unieke ID voor perceel te maken
function makeParcelId(props) {
  return `${props.kadastraleGemeenteWaarde}-${props.sectie}-${props.perceelnummer}`;
}

// Helper om een card te verwijderen
function removeParcelCard(id) {
  const card = document.getElementById('card-'+id);
  if (card) card.parentNode.removeChild(card);
}

map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 3) Toggle deselect: als klik in bestaand parcelLayer
  for (let i = 0; i < selectedParcels.length; i++) {
    const sel = selectedParcels[i];
    if (sel.layer.getBounds().contains(e.latlng)) {
      // deselect
      map.removeLayer(sel.layer);
      removeParcelCard(sel.id);
      selectedParcels.splice(i,1);
      return;
    }
  }

  // 4) Nieuwe bodemsoort ophalen
  let baseCat = '';
  try {
    const resp = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
    const p    = await resp.json();
    if (!resp.ok) throw new Error(p.error || resp.status);
    baseCat = getBaseCategory(p.grondsoort);
  } catch(err) {
    console.error('Bodem fout:',err);
    baseCat = 'Onbekend';
  }

  // 5) Perceel ophalen via proxy
  const proxyUrl = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('🔗 Proxy-perceel URL:', proxyUrl);

  try {
    const r    = await fetch(proxyUrl);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Status ${r.status}`);
    const feat = data.features?.[0];
    if (!feat) return; // geen perceel

    const props = feat.properties;
    const opp   = props.kadastraleGrootteWaarde;       // in m²
    const id    = makeParcelId(props);
    const naam  = props.weergavenaam ||
                  `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;

    // 6) Highlight toevoegen
    const layer = L.geoJSON(feat.geometry, {
      style:{ color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);
    map.fitBounds(layer.getBounds());

    // 7) Card aanmaken en tonen
    const card = document.createElement('div');
    card.className = 'parcel-card';
    card.id = 'card-' + id;
    card.innerHTML = `
      <h3>${naam}</h3>
      <div class="card-grid">
        <div>
          <label>Grondsoort</label>
          <input type="text" value="${baseCat}" readonly />
        </div>
        <div>
          <label>Oppervlakte (ha)</label>
          <input type="text" value="${opp!=null ? (opp/10000).toFixed(2) : ''}" readonly />
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
    document.getElementById('parcelList').appendChild(card);

    // 8) Opslaan in array zodat we kunnen deselecteren
    selectedParcels.push({ id, layer, props });

  } catch(err) {
    console.error('Perceel fout:',err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
