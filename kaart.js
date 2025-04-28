// kaart.js — multi-perceel selectie + dynamic UI

const DEBUG = false;
const LIVE_ERRORS = true;

// 1) Soil‐mapping inladen
let soilMapping = [];
fetch('/data/soilMapping.json')
  .then(r => r.json()).then(j => soilMapping = j)
  .catch(err => console.error('❌ Kan soilMapping.json niet laden:', err));
function getBaseCategory(name) {
  const e = soilMapping.find(x => x.name === name);
  return e?.category || 'Onbekend';
}

// 2) Leaflet init
const map = L.map('map').setView([52.1,5.1],7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OSM contributors'
}).addTo(map);

// 3) Data‐structuur voor geselecteerde percelen
let parcels = []; // elk element: { id, layer, props }

// Hulpfunctie: maak unieke ID
function uuid() {
  return 'p_' + Math.random().toString(36).slice(2);
}

// 4) Helper: render UI‐lijst
function renderParcelList() {
  const container = document.getElementById('parcelList');
  container.innerHTML = '';
  parcels.forEach(p => {
    const div = document.createElement('div');
    div.classList.add('parcel-item');
    div.dataset.id = p.id;
    div.innerHTML = `
      <div class="form-group"><label>Perceel</label><input readonly value="${p.name}"></div>
      <div class="form-group"><label>Grondsoort</label><input readonly value="${p.grondsoort}"></div>
      <div class="form-group"><label>NV-gebied?</label><input readonly value="${p.nvgebied}"></div>
      <div class="form-group"><label>Ha (ha)</label><input readonly value="${p.ha}"></div>
      <div class="form-group"><label>Teelt</label>
        <select class="teelt">
          <option value="mais"${p.gewas==='mais'?' selected':''}>Maïs</option>
          <option value="tarwe"${p.gewas==='tarwe'?' selected':''}>Tarwe</option>
          <option value="suikerbieten"${p.gewas==='suikerbieten'?' selected':''}>Suikerbieten</option>
        </select>
      </div>
      <div class="form-group"><label>Derogatie</label>
        <select class="derogatie">
          <option value="nee"${p.derogatie==='nee'?' selected':''}>Nee</option>
          <option value="ja"${p.derogatie==='ja'?' selected':''}>Ja</option>
        </select>
      </div>
      <button class="remove-btn">Verwijder</button>
    `;
    // button om te deselecteren vanuit UI
    div.querySelector('.remove-btn').onclick = () => {
      removeParcel(p.id);
    };
    // select‐listeners om te slaan in parcels[]
    div.querySelector('.teelt').onchange = e => { p.gewas = e.target.value; };
    div.querySelector('.derogatie').onchange = e => { p.derogatie = e.target.value; };

    container.append(div);
  });
}

// 5) Helper: verwijder perceel uit kaart + UI
function removeParcel(id) {
  const idx = parcels.findIndex(p=>p.id===id);
  if (idx<0) return;
  map.removeLayer(parcels[idx].layer);
  parcels.splice(idx,1);
  renderParcelList();
}

// 6) Click‐handler
map.on('click', async e => {
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // 6a) binnen een bestaand perceel? → deselect
  for (let p of parcels) {
    if (p.layer.getBounds().contains(e.latlng)) {
      removeParcel(p.id);
      return;
    }
  }

  // 6b) Ophalen via Netlify‐proxy
  const url = `/.netlify/functions/perceel?lon=${lon}&lat=${lat}`;
  if (DEBUG) console.log('Proxy-perceel URL →',url);

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error||r.status);
    const feat = data.features?.[0];
    if (!feat) {
      // géén perceel gevonden
      return;
    }

    // 6c) Highlight nieuwe perceel
    const layer = L.geoJSON(feat.geometry, {
      style:{ color:'#1e90ff', weight:2, fillOpacity:0.2 }
    }).addTo(map);
    // map.fitBounds(layer.getBounds()); // kies zelf of je wilt uitzoomen

    // 6d) Lees properties
    const props = feat.properties;
    const name = props.weergavenaam ||
      `${props.kadastraleGemeenteWaarde} ${props.sectie} ${props.perceelnummer}`;
    const opp  = props.kadastraleGrootteWaarde; // m2
    const ha   = opp!=null? (opp/10000).toFixed(2) : '';

    // 6e) Bodemsoort al eerder opgehaald? Zoniet, even ophalen:
    let baseCat = window.huidigeGrond;
    if (!baseCat || baseCat==='Onbekend') {
      try {
        const br = await fetch(`/.netlify/functions/bodemsoort?lon=${lon}&lat=${lat}`);
        const pj = await br.json();
        if (br.ok) baseCat = getBaseCategory(pj.grondsoort);
      } catch {}
    }

    // 6f) voeg toe aan lijst
    const id = uuid();
    parcels.push({
      id,
      layer,
      name,
      grondsoort: baseCat,
      nvgebied: window.isNV? 'Ja':'Nee',
      ha,
      gewas: 'mais',
      derogatie: 'nee'
    });
    renderParcelList();

  } catch(err) {
    console.error('Perceel fout:',err);
    if (LIVE_ERRORS) alert('Fout bij ophalen perceel.');
  }
});
